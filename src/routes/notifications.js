const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const webpush = require('web-push');
const subs = require('../services/subscriptions');
const push = require('../services/push');

const router = express.Router();

// Public key for PushManager (if configured)
router.get('/vapid-public', async (req, res) => {
  if (!(await push.isEnabled())) { return res.status(404).json({ error: 'Not configured' }); }
  const pk = await push.getPublicKey();
  res.json({ publicKey: pk });
});

// Save/replace subscription for current user
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) { return res.status(400).json({ error: 'subscription required' }); }
    await subs.add(req.user.id, subscription);
    res.status(201).json({ ok: true });
  } catch (_e) {
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
  } catch (_e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { router };

// Dev-only helper: generate VAPID keys (admin, non-production)
router.get('/generate-vapid', requireAuth, requireRole('admin'), (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not allowed in production' });
  }
  try {
    const keys = webpush.generateVAPIDKeys();
    res.json({
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      note: 'Ajoutez ces variables dans votre environnement: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT',
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Prod/admin: generate and set keys on server (persisted), requires explicit confirm
router.post('/vapid/generate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { confirm } = req.body || {};
    if (!confirm) { return res.status(400).json({ error: 'confirm required' }); }
    const keys = await push.generateAndSetKeys();
    res.status(201).json({ ok: true, ...keys });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
