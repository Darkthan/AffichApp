const express = require('express');
const { db } = require('../services/db');
const { validateNewRequest, validateStatus } = require('../services/validator');
const { requireAuth, requireRole } = require('../middleware/auth');
const { findByCode } = require('../services/cardTypes');

const router = express.Router();

// GET /api/requests
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await db.getAll();
    // Admins and 'appel' role can view all requests; others see only their own
    if (req.user.role === 'admin' || req.user.role === 'appel') return res.json(items);
    return res.json(items.filter((x) => x.ownerId === req.user.id));
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && req.user.role !== 'appel' && item.ownerId !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// POST /api/requests
router.post('/', requireAuth, async (req, res, next) => {
  try {
    // Rôle 'appel' n'a pas le droit de créer des demandes
    if (req.user.role === 'appel') return res.status(403).json({ error: 'Forbidden' });
    const payload = req.body || {};
    if (typeof payload.applicantName === 'string') payload.applicantName = payload.applicantName.trim();
    if (typeof payload.email === 'string') payload.email = payload.email.trim();
    if (typeof payload.details === 'string') payload.details = payload.details.trim();
    if (payload.email === '') delete payload.email;
    if (payload.details === '') delete payload.details;
    if (typeof payload.cardType === 'string') payload.cardType = payload.cardType.trim();
    const { valid, errors } = validateNewRequest(payload);
    if (!valid) return res.status(400).json({ error: 'Validation failed', details: errors });
    const type = await findByCode(payload.cardType);
    if (!type) return res.status(400).json({ error: 'Unknown cardType' });
    const created = await db.create(payload, req.user);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/:id/status
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    // Only admin and 'appel' roles can update statuses
    if (req.user.role !== 'admin' && req.user.role !== 'appel') return res.status(403).json({ error: 'Forbidden' });
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { status } = req.body || {};
    const { valid, errors } = validateStatus(status);
    if (!valid) return res.status(400).json({ error: 'Validation failed', details: errors });
    const updated = await db.updateStatus(id, status);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/requests/:id (owner or admin)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && item.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const ok = await db.remove(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = { router };
