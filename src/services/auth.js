const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Vérifier ou générer un JWT_SECRET sécurisé
function getOrGenerateJwtSecret() {
  const envSecret = process.env.JWT_SECRET;

  // En production, le secret DOIT être défini dans les variables d'environnement
  if (process.env.NODE_ENV === 'production') {
    if (!envSecret || envSecret === 'devsecret-change-me') {
      console.error('ERREUR FATALE: JWT_SECRET doit être défini dans les variables d\'environnement en production');
      console.error('Générez un secret fort avec: openssl rand -base64 64');
      process.exit(1);
    }
    return envSecret;
  }

  // En développement, générer et persister un secret si non défini
  if (envSecret && envSecret !== 'devsecret-change-me') {
    return envSecret;
  }

  // Générer et stocker un secret pour le développement
  const secretFile = path.join(process.cwd(), 'data', '.jwt-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf-8').trim();
      if (stored) {
        console.log('[DEV] Utilisation du JWT_SECRET stocké dans data/.jwt-secret');
        return stored;
      }
    }

    // Générer un nouveau secret
    const newSecret = crypto.randomBytes(64).toString('base64');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, newSecret, { mode: 0o600 });
    console.log('[DEV] Nouveau JWT_SECRET généré et stocké dans data/.jwt-secret');
    console.warn('⚠️  En production, définissez JWT_SECRET dans les variables d\'environnement');
    return newSecret;
  } catch (e) {
    console.error('Impossible de générer/lire le JWT_SECRET:', e.message);
    process.exit(1);
  }
}

const JWT_SECRET = getOrGenerateJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };

