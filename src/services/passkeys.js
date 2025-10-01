const fs = require('fs');
const path = require('path');

// Structure des données:
// {
//   userId: string,
//   credentialId: string (base64url),
//   publicKey: string (base64url),
//   counter: number,
//   transports: string[],
//   nickname: string,
//   createdAt: timestamp
// }

const passkeysFile = path.join(process.cwd(), 'data', 'passkeys.json');

function readPasskeys() {
  try {
    if (fs.existsSync(passkeysFile)) {
      const data = fs.readFileSync(passkeysFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('[passkeys] Erreur lecture:', e.message);
  }
  return [];
}

function writePasskeys(passkeys) {
  try {
    fs.writeFileSync(passkeysFile, JSON.stringify(passkeys, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[passkeys] Erreur écriture:', e.message);
    return false;
  }
}

/**
 * Ajouter une nouvelle passkey pour un utilisateur
 */
function addPasskey(userId, credentialId, publicKey, counter, transports, nickname) {
  const passkeys = readPasskeys();

  // Vérifier si cette credentialId existe déjà
  const existing = passkeys.find(p => p.credentialId === credentialId);
  if (existing) {
    throw new Error('Cette passkey existe déjà');
  }

  const newPasskey = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
    userId,
    credentialId,
    publicKey,
    counter,
    transports: transports || [],
    nickname: nickname || 'Passkey',
    createdAt: Date.now()
  };

  passkeys.push(newPasskey);
  writePasskeys(passkeys);

  return newPasskey;
}

/**
 * Obtenir toutes les passkeys d'un utilisateur
 */
function getPasskeysByUserId(userId) {
  const passkeys = readPasskeys();
  return passkeys.filter(p => p.userId === userId);
}

/**
 * Obtenir une passkey par son credentialId
 */
function getPasskeyByCredentialId(credentialId) {
  const passkeys = readPasskeys();
  return passkeys.find(p => p.credentialId === credentialId);
}

/**
 * Mettre à jour le compteur d'une passkey (après utilisation)
 */
function updatePasskeyCounter(credentialId, newCounter) {
  const passkeys = readPasskeys();
  const index = passkeys.findIndex(p => p.credentialId === credentialId);

  if (index === -1) {
    return false;
  }

  passkeys[index].counter = newCounter;
  passkeys[index].lastUsedAt = Date.now();

  return writePasskeys(passkeys);
}

/**
 * Supprimer une passkey (par l'utilisateur ou admin)
 */
function deletePasskey(passkeyId, userId, isAdmin = false) {
  const passkeys = readPasskeys();
  const index = passkeys.findIndex(p => p.id === passkeyId);

  if (index === -1) {
    return false;
  }

  // Vérifier les permissions
  if (!isAdmin && passkeys[index].userId !== userId) {
    throw new Error('Vous ne pouvez supprimer que vos propres passkeys');
  }

  passkeys.splice(index, 1);
  return writePasskeys(passkeys);
}

/**
 * Obtenir toutes les passkeys (admin uniquement)
 */
function getAllPasskeys() {
  return readPasskeys();
}

/**
 * Obtenir le nombre de passkeys par utilisateur
 */
function getPasskeysCount() {
  const passkeys = readPasskeys();
  const counts = {};

  passkeys.forEach(p => {
    counts[p.userId] = (counts[p.userId] || 0) + 1;
  });

  return counts;
}

module.exports = {
  addPasskey,
  getPasskeysByUserId,
  getPasskeyByCredentialId,
  updatePasskeyCounter,
  deletePasskey,
  getAllPasskeys,
  getPasskeysCount
};
