const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ALLOWED = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function getSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function updateSettings(updates) {
  await ensureDataDir();
  const current = await getSettings();
  const updated = { ...current, ...updates };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

async function getLogoPathIfExists() {
  await ensureDataDir();
  for (const ext of Object.values(ALLOWED)) {
    const p = path.join(DATA_DIR, `logo.${ext}`);
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return null;
}

async function removeExistingLogos() {
  for (const ext of Object.values(ALLOWED)) {
    const p = path.join(DATA_DIR, `logo.${ext}`);
    try {
      await fs.unlink(p);
    } catch {}
  }
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) {return null;}
  const mime = m[1];
  const b64 = m[2];
  return { mime, b64 };
}

async function saveLogoFromData(data, mime) {
  await ensureDataDir();
  let targetMime = mime;
  let base64 = data;
  const parsed = parseDataUrl(data);
  if (parsed) {
    targetMime = parsed.mime;
    base64 = parsed.b64;
  }
  if (!ALLOWED[targetMime]) {
    const err = new Error('Unsupported mime type');
    err.code = 'E_BAD_MIME';
    throw err;
  }
  const buf = Buffer.from(base64, 'base64');
  // basic size guard (max ~4MB)
  if (buf.length > 4 * 1024 * 1024) {
    const err = new Error('File too large');
    err.code = 'E_TOO_LARGE';
    throw err;
  }
  const ext = ALLOWED[targetMime];
  await removeExistingLogos();
  const filePath = path.join(DATA_DIR, `logo.${ext}`);
  await fs.writeFile(filePath, buf);
  return filePath;
}

module.exports = { getLogoPathIfExists, saveLogoFromData, getSettings, updateSettings };

