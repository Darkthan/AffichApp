const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const apiKeys = require('../services/apiKeys');

const router = express.Router();

const VALID_ROLES = ['admin', 'requester', 'appel'];

router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const keys = await apiKeys.getAll();
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { name, role } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Field "name" is required' });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Field "role" must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const { record, rawKey } = await apiKeys.create(name.trim(), role);
    res.status(201).json({ ...record, key: rawKey, _note: 'Save this key — it will not be shown again.' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) { return res.status(400).json({ error: 'Invalid id' }); }
    const ok = await apiKeys.remove(id);
    if (!ok) { return res.status(404).json({ error: 'Not found' }); }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = { router };
