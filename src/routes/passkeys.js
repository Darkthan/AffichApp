const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getByEmail, getById } = require('../services/users');
const { signToken } = require('../services/auth');
const passkeysService = require('../services/passkeys');
const { getSettings } = require('../services/settings');

// Polyfill WebCrypto for Node.js 18
if (!globalThis.crypto) {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const router = express.Router();

// Fonction pour obtenir la configuration WebAuthn
async function getRpConfig(req) {
  // 1. Lire depuis data/settings.json
  const settings = await getSettings();
  let effectiveRpName = settings.rpName || process.env.RP_NAME || 'Application Demandes Cartes';
  let effectiveRpID = settings.rpID || process.env.RP_ID || '';
  let effectiveOrigin = settings.origin || process.env.ORIGIN || '';

  // 2. Si toujours pas configuré, détecter depuis la requête
  if (!effectiveRpID || !effectiveOrigin) {
    const host = req.get('host') || 'localhost';
    const protocol = req.protocol || 'http';

    if (!effectiveRpID) {
      effectiveRpID = host.split(':')[0]; // Enlever le port
    }

    if (!effectiveOrigin) {
      effectiveOrigin = `${protocol}://${host}`;
    }

    console.log(`[passkeys] Auto-détection: rpID="${effectiveRpID}", origin="${effectiveOrigin}"`);
  } else {
    console.log(`[passkeys] Configuration depuis settings: rpName="${effectiveRpName}", rpID="${effectiveRpID}", origin="${effectiveOrigin}"`);
  }

  return { rpName: effectiveRpName, rpID: effectiveRpID, origin: effectiveOrigin };
}

// Stockage temporaire des challenges (en production, utiliser Redis ou similaire)
const challenges = new Map();

// === ENREGISTREMENT D'UNE PASSKEY ===

// Étape 1: Générer les options d'enregistrement
router.post('/register/generate-options', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { rpName: effectiveRpName, rpID: effectiveRpID, origin: effectiveOrigin } = await getRpConfig(req);

    // Récupérer les passkeys existantes pour exclure les credentialIds déjà utilisés
    const existingPasskeys = passkeysService.getPasskeysByUserId(user.id);
    const excludeCredentials = existingPasskeys.map(pk => ({
      id: Buffer.from(pk.credentialId, 'base64url'),
      type: 'public-key',
      transports: pk.transports
    }));

    const options = await generateRegistrationOptions({
      rpName: effectiveRpName,
      rpID: effectiveRpID,
      userID: Buffer.from(user.id.toString()),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      }
    });

    // Stocker le challenge temporairement
    challenges.set(user.id, options.challenge);

    // Expirer le challenge après 5 minutes
    setTimeout(() => challenges.delete(user.id), 5 * 60 * 1000);

    res.json(options);
  } catch (e) {
    console.error('[passkeys] Erreur generate-options:', e);
    console.error('[passkeys] Stack:', e.stack);
    res.status(500).json({ error: 'Erreur génération options', message: e.message, details: e.stack });
  }
});

// Étape 2: Vérifier et enregistrer la passkey
router.post('/register/verify', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { credential, nickname } = req.body;
    const { rpID: effectiveRpID, origin: effectiveOrigin } = await getRpConfig(req);

    if (!credential) {
      return res.status(400).json({ error: 'Credential requis' });
    }

    // Récupérer le challenge
    const expectedChallenge = challenges.get(user.id);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expiré ou invalide' });
    }

    // Vérifier la réponse
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: effectiveOrigin,
      expectedRPID: effectiveRpID
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Vérification échouée' });
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    // Enregistrer la passkey
    const passkey = passkeysService.addPasskey(
      user.id,
      Buffer.from(credentialID).toString('base64url'),
      Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      credential.response.transports || [],
      nickname || 'Passkey'
    );

    // Nettoyer le challenge
    challenges.delete(user.id);

    console.log(`[passkeys] Passkey enregistrée pour ${user.email}`);

    res.json({ success: true, passkey: { id: passkey.id, nickname: passkey.nickname, createdAt: passkey.createdAt } });
  } catch (e) {
    console.error('[passkeys] Erreur verify:', e);
    res.status(500).json({ error: 'Erreur vérification', message: e.message });
  }
});

// === AUTHENTIFICATION PAR PASSKEY ===

// Étape 1: Générer les options d'authentification (avec ou sans email)
router.post('/authenticate/generate-options', async (req, res) => {
  try {
    const { email } = req.body;
    const { rpID: effectiveRpID } = await getRpConfig(req);

    let allowCredentials;
    let challengeKey;

    if (email) {
      // Mode avec email: limiter aux passkeys de cet utilisateur
      const user = await getByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Utilisateur inconnu ou aucune passkey' });
      }

      const passkeys = passkeysService.getPasskeysByUserId(user.id);
      if (passkeys.length === 0) {
        return res.status(404).json({ error: 'Aucune passkey enregistrée' });
      }

      allowCredentials = passkeys.map(pk => ({
        id: Buffer.from(pk.credentialId, 'base64url'),
        type: 'public-key',
        transports: pk.transports
      }));

      challengeKey = `auth_${email}`;
    } else {
      // Mode discoverable: pas de restriction, le navigateur propose toutes les passkeys
      allowCredentials = undefined;
      challengeKey = `auth_discoverable_${Date.now()}_${Math.random()}`;
    }

    const options = await generateAuthenticationOptions({
      rpID: effectiveRpID,
      allowCredentials,
      userVerification: 'preferred'
    });

    // Stocker le challenge
    challenges.set(challengeKey, options.challenge);

    // Expirer après 5 minutes
    setTimeout(() => challenges.delete(challengeKey), 5 * 60 * 1000);

    res.json({ ...options, challengeKey });
  } catch (e) {
    console.error('[passkeys] Erreur auth generate-options:', e);
    res.status(500).json({ error: 'Erreur génération options', message: e.message });
  }
});

// Étape 2: Vérifier et authentifier
router.post('/authenticate/verify', async (req, res) => {
  try {
    const { email, credential, challengeKey } = req.body;
    const { rpID: effectiveRpID, origin: effectiveOrigin } = await getRpConfig(req);

    if (!credential) {
      return res.status(400).json({ error: 'Credential requis' });
    }

    // Récupérer le challenge
    const actualChallengeKey = challengeKey || (email ? `auth_${email}` : null);
    if (!actualChallengeKey) {
      return res.status(400).json({ error: 'challengeKey ou email requis' });
    }

    const expectedChallenge = challenges.get(actualChallengeKey);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expiré ou invalide' });
    }

    // Récupérer la passkey utilisée (rawId est déjà en base64url)
    const passkey = passkeysService.getPasskeyByCredentialId(credential.rawId);

    if (!passkey) {
      return res.status(401).json({ error: 'Passkey invalide' });
    }

    // Récupérer l'utilisateur associé à la passkey
    const user = await getById(passkey.userId);
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur inconnu' });
    }

    // Vérifier la réponse
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: effectiveOrigin,
      expectedRPID: effectiveRpID,
      authenticator: {
        credentialID: Buffer.from(passkey.credentialId, 'base64url'),
        credentialPublicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: passkey.counter
      }
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'Vérification échouée' });
    }

    // Mettre à jour le compteur
    passkeysService.updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter);

    // Nettoyer le challenge
    challenges.delete(actualChallengeKey);

    // Générer le token JWT
    const token = signToken({ sub: user.id, role: user.role });

    console.log(`[passkeys] Authentification réussie pour ${user.email} via passkey`);

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error('[passkeys] Erreur auth verify:', e);
    res.status(500).json({ error: 'Erreur authentification', message: e.message });
  }
});

// === GESTION DES PASSKEYS ===

// Liste des passkeys de l'utilisateur
router.get('/my-passkeys', requireAuth, (req, res) => {
  try {
    const passkeys = passkeysService.getPasskeysByUserId(req.user.id);

    // Ne pas exposer les clés publiques
    const safe = passkeys.map(pk => ({
      id: pk.id,
      nickname: pk.nickname,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt
    }));

    res.json(safe);
  } catch (e) {
    console.error('[passkeys] Erreur my-passkeys:', e);
    res.status(500).json({ error: 'Erreur récupération passkeys', message: e.message });
  }
});

// Supprimer une passkey (utilisateur)
router.delete('/my-passkeys/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const success = passkeysService.deletePasskey(id, req.user.id, false);

    if (!success) {
      return res.status(404).json({ error: 'Passkey non trouvée' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[passkeys] Erreur delete:', e);
    res.status(403).json({ error: e.message });
  }
});

// Liste toutes les passkeys (admin uniquement)
router.get('/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const allPasskeys = passkeysService.getAllPasskeys();

    // Enrichir avec les infos utilisateur
    const enriched = await Promise.all(allPasskeys.map(async (pk) => {
      const user = await getById(pk.userId);
      return {
        id: pk.id,
        userId: pk.userId,
        userName: user ? user.name : 'Utilisateur inconnu',
        userEmail: user ? user.email : 'N/A',
        nickname: pk.nickname,
        createdAt: pk.createdAt,
        lastUsedAt: pk.lastUsedAt
      };
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[passkeys] Erreur all:', e);
    res.status(500).json({ error: 'Erreur récupération passkeys', message: e.message });
  }
});

// Supprimer n'importe quelle passkey (admin uniquement)
router.delete('/all/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const success = passkeysService.deletePasskey(id, req.user.id, true);

    if (!success) {
      return res.status(404).json({ error: 'Passkey non trouvée' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[passkeys] Erreur admin delete:', e);
    res.status(500).json({ error: 'Erreur suppression', message: e.message });
  }
});

module.exports = { router };
