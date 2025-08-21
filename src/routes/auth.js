const express = require('express');
const rateLimit = require('express-rate-limit');
const { getByEmail, create, seedAdminIfEmpty } = require('../services/users');
const { verifyPassword, signToken } = require('../services/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Rate limiters for auth-sensitive routes
const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const passwordChangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Ensure admin seed on startup of this router
seedAdminIfEmpty().catch((e) => console.error('Admin seed error:', e));

router.post('/login', loginLimiter, async (req, res) => {
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
  if (!['admin', 'requester', 'appel'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
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

// PATCH /api/auth/me/password — change own password
router.patch('/me/password', requireAuth, passwordChangeLimiter, async (req, res) => {
  const { password, confirm } = req.body || {};
  const pwd = typeof password === 'string' ? password : '';
  const cfm = typeof confirm === 'string' ? confirm : undefined;
  if (!pwd || pwd.trim().length < 4) return res.status(400).json({ error: 'Password too short' });
  if (cfm != null && cfm !== pwd) return res.status(400).json({ error: 'Passwords do not match' });
  try {
    const updated = await require('../services/users').update(req.user.id, { password: pwd });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { router };
