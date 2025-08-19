const express = require('express');
const { getAll, getById, update, remove } = require('../services/users');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res) => {
  const users = await getAll();
  res.json(users.map(({ passwordHash, ...u }) => u));
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const user = await getById(id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { name, email, role, password } = req.body || {};
  if (role && !['admin', 'requester'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const user = await update(id, { name, email, role, password });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (e) {
    if (e.code === 'E_DUPLICATE_EMAIL') return res.status(409).json({ error: 'Email already exists' });
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = { router };
