const express = require('express');
const { requireAuth } = require('../middleware/auth');
const subs = require('../services/subscriptions');
const push = require('../services/push');

const router = express.Router();

// Public key for PushManager (if configured)
router.get('/vapid-public', (req, res) => {
  if (!push.isEnabled()) { return res.status(404).json({ error: 'Not configured' }); }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save/replace subscription for current user
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) { return res.status(400).json({ error: 'subscription required' }); }
    await subs.add(req.user.id, subscription);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Remove subscription for current user (by endpoint)
router.delete('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) { return res.status(400).json({ error: 'endpoint required' }); }
    const ok = await subs.remove(req.user.id, endpoint);
    if (!ok) { return res.status(404).json({ error: 'Not found' }); }
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { router };

