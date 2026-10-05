const express = require('express');
const oauth = require('../services/oauth');
const { getById } = require('../services/users');
const { db } = require('../services/db');
const { getAll: getCardTypes, findByCode } = require('../services/cardTypes');
const { validateStatus } = require('../services/validator');
const suggestions = require('../services/suggestions');
const { origin } = require('./oauth');

const router = express.Router();

// This router is mounted before CSRF: it accepts only verified OAuth bearer tokens,
// never browser cookies, JWT sessions or API keys.
router.use(async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const header = req.get('Authorization') || '';
    const grant = header.startsWith('Bearer ') ? await oauth.verifyAccessGrant(header.slice(7)) : null;
    const user = grant ? await getById(grant.userId) : null;
    if (!user) {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource/api/integration"`);
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.user = user;
    req.oauthScopes = grant.scope.split(' ');
    return next();
  } catch (error) { return next(error); }
});

function scopeRequired(scope) {
  return (req, res, next) => {
    if (!req.oauthScopes.includes(scope)) {
      res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`);
      return res.status(403).json({ error: 'insufficient_scope', required_scope: scope });
    }
    return next();
  };
}

router.get('/cards', scopeRequired('cards:read'), async (req, res, next) => {
  try {
    const { status, cardType } = req.query;
    if (status !== undefined && status !== 'all' && !validateStatus(status).valid) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (cardType !== undefined && (typeof cardType !== 'string' || !await findByCode(cardType))) {
      return res.status(400).json({ error: 'Unknown cardType' });
    }
    const items = (await db.getAll()).filter(item =>
      (['admin', 'appel'].includes(req.user.role) || item.ownerId === req.user.id) &&
      (status === 'all' || (status ? item.status === status : item.status !== 'disponible')) &&
      (!cardType || item.cardType === cardType));
    // Return the fields needed to process cards, without emails or private details.
    return res.json(items.map(({ id, applicantName, cardType, status, createdAt, updatedAt }) =>
      ({ id, applicantName, cardType, status, createdAt, updatedAt })));
  } catch (error) { return next(error); }
});

router.get('/card-types', scopeRequired('cards:read'), async (req, res, next) => {
  try { return res.json(await getCardTypes()); }
  catch (error) { return next(error); }
});

router.patch('/cards/:id/status', scopeRequired('cards:write'), async (req, res, next) => {
  try {
    if (!['admin', 'appel'].includes(req.user.role)) { return res.status(403).json({ error: 'Forbidden' }); }
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { return res.status(400).json({ error: 'Invalid id' }); }
    const { status } = req.body || {};
    const validation = validateStatus(status);
    if (!validation.valid) { return res.status(400).json({ error: 'Validation failed', details: validation.errors }); }
    const item = await db.updateStatus(id, status);
    if (!item) { return res.status(404).json({ error: 'Not found' }); }
    return res.json({ id: item.id, applicantName: item.applicantName, cardType: item.cardType, status: item.status, updatedAt: item.updatedAt });
  } catch (error) { return next(error); }
});

router.post('/names', scopeRequired('names:write'), async (req, res, next) => {
  try {
    if (!['admin', 'appel'].includes(req.user.role)) { return res.status(403).json({ error: 'Forbidden' }); }
    const { name, cardType } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
      return res.status(400).json({ error: 'name must contain 1 to 200 characters without control characters' });
    }
    if (cardType !== undefined && (typeof cardType !== 'string' || !await findByCode(cardType))) {
      return res.status(400).json({ error: 'Unknown cardType' });
    }
    const saved = await suggestions.addOrUpdate(name.trim(), cardType);
    return res.status(200).json({ name: saved.name, cardType: saved.cardType });
  } catch (error) { return next(error); }
});

module.exports = { router };
