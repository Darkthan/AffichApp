const express = require('express');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveLogoFromData } = require('../services/settings');

const router = express.Router();

// POST /api/settings/logo { data: dataURL or base64, mime?: string }
router.post('/logo', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data, mime } = req.body || {};
    if (!data) {return res.status(400).json({ error: 'data required' });}
    const filePath = await saveLogoFromData(data, mime);
    res.status(201).json({ ok: true, url: '/public/logo', file: path.basename(filePath) });
  } catch (e) {
    if (e.code === 'E_BAD_MIME') {return res.status(400).json({ error: 'Unsupported file type' });}
    if (e.code === 'E_TOO_LARGE') {return res.status(413).json({ error: 'File too large' });}
    console.error('Upload logo error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { router };

