const fs = require('fs');
const path = require('path');

// Structure des données:
// {
//   enabled: boolean,
//   maxAttempts: number (défaut 5),
//   banDuration: number en minutes (défaut 15),
//   attempts: { [ip]: { count: number, firstAttempt: timestamp, bannedUntil?: timestamp } }
// }

const configFile = path.join(process.cwd(), 'data', 'fail2ban-config.json');
const attemptsFile = path.join(process.cwd(), 'data', 'fail2ban-attempts.json');

const defaultConfig = {
  enabled: true,
  maxAttempts: 5,
  banDuration: 15 // minutes
};

function readConfig() {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (e) {
    console.warn('[fail2ban] Erreur lecture config:', e.message);
  }
  return { ...defaultConfig };
}

function writeConfig(config) {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[fail2ban] Erreur écriture config:', e.message);
    return false;
  }
}

function readAttempts() {
  try {
    if (fs.existsSync(attemptsFile)) {
      const data = fs.readFileSync(attemptsFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('[fail2ban] Erreur lecture attempts:', e.message);
  }
  return {};
}

function writeAttempts(attempts) {
  try {
    fs.writeFileSync(attemptsFile, JSON.stringify(attempts, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[fail2ban] Erreur écriture attempts:', e.message);
    return false;
  }
}

// Nettoie les anciennes tentatives (plus de 1 heure)
function cleanOldAttempts(attempts) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const cleaned = {};

  Object.keys(attempts).forEach((ip) => {
    const record = attempts[ip];
    // Garder si banni et pas expiré, ou si tentative récente
    if (record.bannedUntil && record.bannedUntil > now) {
      cleaned[ip] = record;
    } else if (!record.bannedUntil && (now - record.firstAttempt) < oneHour) {
      cleaned[ip] = record;
    }
  });

  return cleaned;
}

/**
 * Vérifie si une IP est bannie
 * @param {string} ip - Adresse IP
 * @returns {boolean|number} false si pas banni, sinon timestamp de fin de ban
 */
function isBanned(ip) {
  const config = readConfig();
  if (!config.enabled) {
    return false;
  }

  const attempts = readAttempts();
  const record = attempts[ip];

  if (!record || !record.bannedUntil) {
    return false;
  }

  const now = Date.now();
  if (record.bannedUntil > now) {
    return record.bannedUntil;
  }

  // Ban expiré, nettoyer
  delete attempts[ip];
  writeAttempts(attempts);
  return false;
}

/**
 * Enregistre une tentative de connexion échouée
 * @param {string} ip - Adresse IP
 * @returns {boolean} true si l'IP vient d'être bannie
 */
function recordFailedAttempt(ip) {
  const config = readConfig();
  if (!config.enabled) {
    return false;
  }

  let attempts = readAttempts();
  attempts = cleanOldAttempts(attempts);

  const now = Date.now();

  if (!attempts[ip]) {
    attempts[ip] = {
      count: 1,
      firstAttempt: now
    };
  } else {
    attempts[ip].count += 1;
  }

  // Vérifier si on doit bannir
  if (attempts[ip].count >= config.maxAttempts) {
    const banUntil = now + (config.banDuration * 60 * 1000);
    attempts[ip].bannedUntil = banUntil;
    console.warn(`[fail2ban] IP ${ip} bannie jusqu'à ${new Date(banUntil).toISOString()} (${attempts[ip].count} tentatives)`);
    writeAttempts(attempts);
    return true;
  }

  writeAttempts(attempts);
  return false;
}

/**
 * Réinitialise les tentatives pour une IP (après connexion réussie)
 * @param {string} ip - Adresse IP
 */
function resetAttempts(ip) {
  const attempts = readAttempts();
  if (attempts[ip]) {
    delete attempts[ip];
    writeAttempts(attempts);
  }
}

/**
 * Débannir une IP manuellement
 * @param {string} ip - Adresse IP
 */
function unbanIp(ip) {
  const attempts = readAttempts();
  if (attempts[ip]) {
    delete attempts[ip];
    writeAttempts(attempts);
    console.log(`[fail2ban] IP ${ip} débannie manuellement`);
    return true;
  }
  return false;
}

/**
 * Obtenir la liste des IPs bannies
 * @returns {Array} Liste des IPs bannies avec leurs infos
 */
function getBannedIps() {
  const config = readConfig();
  if (!config.enabled) {
    return [];
  }

  const attempts = readAttempts();
  const now = Date.now();
  const banned = [];

  Object.keys(attempts).forEach((ip) => {
    const record = attempts[ip];
    if (record.bannedUntil && record.bannedUntil > now) {
      banned.push({
        ip,
        bannedUntil: record.bannedUntil,
        attempts: record.count,
        firstAttempt: record.firstAttempt
      });
    }
  });

  return banned;
}

/**
 * Obtenir les statistiques fail2ban
 */
function getStats() {
  const config = readConfig();
  const attempts = readAttempts();
  const now = Date.now();

  let bannedCount = 0;
  let activeAttempts = 0;

  Object.values(attempts).forEach((record) => {
    if (record.bannedUntil && record.bannedUntil > now) {
      bannedCount++;
    } else if (!record.bannedUntil) {
      activeAttempts++;
    }
  });

  return {
    enabled: config.enabled,
    maxAttempts: config.maxAttempts,
    banDuration: config.banDuration,
    bannedIpsCount: bannedCount,
    activeAttemptsCount: activeAttempts,
    totalRecords: Object.keys(attempts).length
  };
}

module.exports = {
  readConfig,
  writeConfig,
  isBanned,
  recordFailedAttempt,
  resetAttempts,
  unbanIp,
  getBannedIps,
  getStats
};
