const { verifyToken } = require('../services/auth');
const { getById } = require('../services/users');
const apiKeys = require('../services/apiKeys');

async function requireAuth(req, res, next) {
  // If apiKeyPreAuth already validated the key (before CSRF middleware), reuse the result
  if (req.isApiKeyAuth) {
    if (!req.user) { return res.status(401).json({ error: 'Invalid API key' }); }
    return next();
  }

  // Fallback: validate API key here if pre-auth middleware was not in the chain
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const keyRecord = await apiKeys.validate(apiKey);
    if (!keyRecord) { return res.status(401).json({ error: 'Invalid API key' }); }
    req.user = { role: keyRecord.role, name: keyRecord.name, apiKeyId: keyRecord.id };
    return next();
  }

  // Authentification par JWT (Bearer token)
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {return res.status(401).json({ error: 'Unauthorized' });}
  const payload = verifyToken(token);
  if (!payload || !payload.sub) {return res.status(401).json({ error: 'Unauthorized' });}
  const user = await getById(payload.sub);
  if (!user) {return res.status(401).json({ error: 'Unauthorized' });}
  req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
  return next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {return res.status(401).json({ error: 'Unauthorized' });}
    if (req.user.role !== role) {return res.status(403).json({ error: 'Forbidden' });}
    return next();
  };
}

module.exports = { requireAuth, requireRole };
