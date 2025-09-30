const express = require('express');
const { requireAuth } = require('../middleware/auth');
const calls = require('../services/calls');

const router = express.Router();

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// GET /api/calls — authenticated users can see all active calls
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await calls.getAll();
    res.json(items);
  } catch (err) { next(err); }
});

// POST /api/calls — any authenticated role can create a call (name + location)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, location } = req.body || {};
    if (!isNonEmptyString(name) || !isNonEmptyString(location)) {
      return res.status(400).json({ error: 'name and location are required' });
    }
    const created = await calls.create({ name: name.trim(), location: location.trim() }, req.user);
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// DELETE /api/calls/:id — allowed for any authenticated role (per requirement)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {return res.status(400).json({ error: 'Invalid id' });}
    const items = await calls.getAll();
    const item = items.find((x) => x.id === id);
    if (!item) {return res.status(404).json({ error: 'Not found' });}
    const ok = await calls.remove(id);
    if (!ok) {return res.status(404).json({ error: 'Not found' });}
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = { router };
