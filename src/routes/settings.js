const express = require('express');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const { saveLogoFromData } = require('../services/settings');
const { getAll: getCardTypes } = require('../services/cardTypes');
const suggestions = require('../services/suggestions');

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

module.exports = { router };
