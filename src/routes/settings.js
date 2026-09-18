const express = require('express');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveLogoFromData, getSettings, updateSettings } = require('../services/settings');
const { getAll: getCardTypes } = require('../services/cardTypes');
const suggestions = require('../services/suggestions');
const mailer = require('../services/mailer');

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

// (export moved to end of file)

// POST /api/settings/suggestions/import-csv { csv: string }
router.post('/suggestions/import-csv', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { csv } = req.body || {};
    if (!csv || typeof csv !== 'string') { return res.status(400).json({ error: 'csv required' }); }

    const types = await getCardTypes();
    const typeByCode = Object.fromEntries(types.map((t) => [t.code.toLowerCase(), t.code]));
    const typeByLabel = Object.fromEntries(types.map((t) => [t.label.toLowerCase(), t.code]));

    function normalizeType(v) {
      if (!v) { return null; }
      const s = String(v).trim().toLowerCase();
      if (typeByCode[s]) { return typeByCode[s]; }
      if (typeByLabel[s]) { return typeByLabel[s]; }
      return null;
    }

    // detect delimiter from first non-empty line (prefer ; then ,)
    const lines = csv.split(/\r?\n/).filter((l) => l && l.trim().length > 0);
    if (!lines.length) { return res.status(400).json({ error: 'empty_csv' }); }
    const first = lines[0];
    const delim = first.includes(';') ? ';' : (first.includes(',') ? ',' : ';');

    let imported = 0; let skipped = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const parts = raw.split(delim).map((x) => x.trim());
      if (parts.length < 2) { skipped++; continue; }
      const name = parts[0];
      const typeRaw = parts[1];
      // skip header row heuristics
      const hdr = name.toLowerCase();
      const hdr2 = String(typeRaw || '').toLowerCase();
      if (i === 0 && (hdr.includes('nom') || hdr.includes('prenom') || hdr.includes('prénom')) && (hdr2.includes('type'))) { skipped++; continue; }
      if (!name || !name.trim()) { skipped++; continue; }
      const typeCode = normalizeType(typeRaw);
      if (!typeCode) { skipped++; continue; }
      try {
        await suggestions.addOrUpdate(name, typeCode);
        imported++;
      } catch {
        skipped++;
      }
    }
    res.status(201).json({ ok: true, imported, skipped });
  } catch (e) {
    console.error('Import CSV error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/settings/suggestions/export-csv -> CSV download of suggestions
router.get('/suggestions/export-csv', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const list = await suggestions.getAll();
    const header = 'NOM/PRENOM;TYPE\n';
    const body = list.map((x) => `${(x.name || '').replaceAll(';', ',')};${x.cardType || ''}`).join('\n');
    const csv = header + body + (body ? '\n' : '');
    const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="suggestions-export-${stamp}.csv"`);
    res.status(200).send(csv);
  } catch (e) {
    console.error('Export CSV error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/settings/suggestions -> clear suggestions store
router.delete('/suggestions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await suggestions.clearAll();
    res.status(204).send();
  } catch (e) {
    console.error('Clear suggestions error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/settings/webauthn -> récupère les paramètres WebAuthn
router.get('/webauthn', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      rpName: settings.rpName || '',
      rpID: settings.rpID || '',
      origin: settings.origin || ''
    });
  } catch (e) {
    console.error('Get webauthn settings error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/settings/webauthn { rpName, rpID, origin }
router.patch('/webauthn', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rpName, rpID, origin } = req.body || {};
    const updates = {};
    if (rpName !== undefined) {updates.rpName = rpName;}
    if (rpID !== undefined) {updates.rpID = rpID;}
    if (origin !== undefined) {updates.origin = origin;}

    await updateSettings(updates);
    res.json({ ok: true });
  } catch (e) {
    console.error('Update webauthn settings error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

function safeMagicLinkConfiguration(config) {
  return {
    appBaseUrl: config.appBaseUrl,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUser: config.smtpUser,
    mailFrom: config.mailFrom,
    passwordConfigured: Boolean(config.smtpPass),
    configured: mailer.isConfigured(config),
    environmentOverrides: config.environmentOverrides,
  };
}

router.get('/magic-link', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const config = await mailer.getConfiguration();
    res.json(safeMagicLinkConfiguration(config));
  } catch (error) {
    console.error('Get magic-link settings error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.patch('/magic-link', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    const appBaseUrl = String(body.appBaseUrl || '').trim().replace(/\/$/, '');
    const smtpHost = String(body.smtpHost || '').trim();
    const smtpPort = Number.parseInt(body.smtpPort, 10);
    const smtpUser = String(body.smtpUser || '').trim();
    const smtpPass = typeof body.smtpPass === 'string' ? body.smtpPass : '';
    const mailFrom = String(body.mailFrom || '').trim();

    if (appBaseUrl) {
      let parsed;
      try { parsed = new URL(appBaseUrl); } catch { return res.status(400).json({ error: 'Invalid APP_BASE_URL' }); }
      if (!['http:', 'https:'].includes(parsed.protocol)) { return res.status(400).json({ error: 'Invalid APP_BASE_URL' }); }
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      return res.status(400).json({ error: 'Invalid SMTP port' });
    }
    if (smtpPass.length > 1024) { return res.status(400).json({ error: 'SMTP password too long' }); }

    const config = await mailer.updateStoredConfiguration({
      appBaseUrl,
      smtpHost,
      smtpPort,
      smtpSecure: body.smtpSecure === true,
      smtpUser,
      smtpPass,
      clearPassword: body.clearPassword === true,
      mailFrom,
    });
    res.json(safeMagicLinkConfiguration(config));
  } catch (error) {
    console.error('Update magic-link settings error:', error);
    if (error.code === 'E_ENCRYPTION_KEY_REQUIRED') {
      return res.status(503).json({ error: 'Encryption key is not configured' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = { router };
