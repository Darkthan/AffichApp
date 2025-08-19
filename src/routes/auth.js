const express = require('express');
const { getByEmail, create, seedAdminIfEmpty } = require('../services/users');
const { verifyPassword, signToken } = require('../services/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Ensure admin seed on startup of this router
seedAdminIfEmpty().catch((e) => console.error('Admin seed error:', e));

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = await getByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ sub: user.id, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// Admin creates users
router.post('/register', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { name, email, role, password } = req.body || {};
  if (!name || !email || !role || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!['admin', 'requester'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const user = await create({ name, email, role, password });
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'E_DUPLICATE_EMAIL') return res.status(409).json({ error: 'Email already exists' });
    console.error('Register error:', e);
    res.status(500).json({ error: 'Internal Server Error', message: e && e.message ? e.message : undefined });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router };
