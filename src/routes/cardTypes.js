const express = require('express');
const { getAll, create, findByCode, removeByCode, seedDefaultsIfEmpty } = require('../services/cardTypes');
const { db } = require('../services/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

seedDefaultsIfEmpty().catch((e) => console.error('Card types seed error:', e));

router.get('/', async (req, res) => {
  const items = await getAll();
  res.json(items);
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { code, label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });
  try {
    const item = await create({ code, label });
    res.status(201).json(item);
  } catch (e) {
    if (e.code === 'E_DUPLICATE_CODE') return res.status(409).json({ error: 'code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/card-types/:code (admin)
router.delete('/:code', requireAuth, requireRole('admin'), async (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'Invalid code' });
  const type = await findByCode(code);
  if (!type) return res.status(404).json({ error: 'Not found' });
  // Check usage in requests
  const requests = await db.getAll();
  if (requests.some((r) => (r.cardType || '').toLowerCase() === code)) {
    return res.status(409).json({ error: 'Type in use' });
  }
  const ok = await removeByCode(code);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = { router };
