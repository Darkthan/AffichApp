/**
 * Extrait la vraie adresse IP du client, même derrière un reverse proxy
 * @param {Object} req - L'objet request Express
 * @returns {string} L'adresse IP normalisée du client
 */
function getClientIp(req) {
  // 1. X-Forwarded-For: standard pour les reverse proxies
  //    Format: "client, proxy1, proxy2"
  //    On prend la première IP (le vrai client)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return normalizeIp(ips[0]);
    }
  }

  // 2. X-Real-IP: alternative utilisée par nginx et autres
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    return normalizeIp(xRealIp);
  }

  // 3. CF-Connecting-IP: spécifique à Cloudflare
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return normalizeIp(cfConnectingIp);
  }

  // 4. X-Client-IP: autre header parfois utilisé
  const xClientIp = req.headers['x-client-ip'];
  if (xClientIp) {
    return normalizeIp(xClientIp);
  }

  // 5. Fallback: req.ip (avec trust proxy activé, Express lit déjà X-Forwarded-For)
  //    ou req.connection.remoteAddress en dernier recours
  const rawIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  return normalizeIp(rawIp);
}

/**
 * Normalise une adresse IP (convertit IPv6 mapped IPv4 en IPv4)
 * @param {string} ip - L'adresse IP à normaliser
 * @returns {string} L'adresse IP normalisée
 */
function normalizeIp(ip) {
  if (!ip) {
    return 'unknown';
  }

  // Nettoyer les espaces
  ip = ip.trim();

  // Convertir ::ffff:127.0.0.1 (IPv6 mapped IPv4) en 127.0.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  // Convertir ::1 (localhost IPv6) en 127.0.0.1
  if (ip === '::1') {
    return '127.0.0.1';
  }

  return ip;
}

module.exports = { getClientIp, normalizeIp };
