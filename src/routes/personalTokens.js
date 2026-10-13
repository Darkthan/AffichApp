const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../services/auth');
const { getById } = require('../services/users');
const tokens = require('../services/personalTokens');

const router = express.Router();
router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(403).json({ error: 'HTTPS requis.' });
  }
  try {
    // Only an interactive account session can manage personal tokens; never a service key or PAT.
    const bearer = /^Bearer (\S+)$/i.exec(req.get('Authorization') || '');
    const payload = bearer && verifyToken(bearer[1]);
    const user = payload && payload.sub && await getById(payload.sub);
    if (!user || req.get('X-API-Key')) { return res.status(401).json({ error: 'Connexion au compte requise.' }); }
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Protection CSRF requise.' });
    }
    req.user = user;
    return next();
  } catch (error) { return next(error); }
});
const creationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });

router.get('/', async (req, res, next) => {
  try { res.json(await tokens.list(req.user.id)); } catch (error) { next(error); }
});
router.post('/', creationLimiter, async (req, res, next) => {
  const { name, expiresInDays = 90 } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    return res.status(400).json({ error: 'Nom requis (80 caractères maximum) et durée entre 1 et 365 jours.' });
  }
  try { res.status(201).json(await tokens.create(req.user, name.trim(), expiresInDays)); }
  catch (error) { if (error.status === 409) { return res.status(409).json({ error: error.message }); } next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    if (!await tokens.revoke(req.user.id, req.params.id)) { return res.status(404).json({ error: 'Jeton introuvable.' }); }
    res.status(204).end();
  } catch (error) { next(error); }
});
module.exports = { router };
