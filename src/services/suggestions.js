const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'suggestions.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(FILE); } catch { await fs.writeFile(FILE, '[]', 'utf-8'); }
}

function normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(FILE, 'utf-8');
  try { const data = JSON.parse(raw); return Array.isArray(data) ? data : []; } catch { return []; }
}

async function writeAll(items) {
  await ensureStore();
  await fs.writeFile(FILE, JSON.stringify(items, null, 2), 'utf-8');
}

async function addOrUpdate(name, cardType) {
  const items = await readAll();
  const key = normName(name);
  if (!key) { return null; }
  const now = new Date().toISOString();
  const idx = items.findIndex((x) => x.key === key);
  if (idx === -1) {
    const rec = { key, name: String(name).trim(), cardType: cardType || null, count: 1, updatedAt: now };
    items.push(rec);
  } else {
    items[idx].name = String(name).trim();
    if (cardType) { items[idx].cardType = cardType; }
    items[idx].count = (items[idx].count || 0) + 1;
    items[idx].updatedAt = now;
  }
  await writeAll(items);
  return true;
}

async function getAll() {
  const items = await readAll();
  // sort by count desc then updatedAt desc
  return items.sort((a, b) => (b.count || 0) - (a.count || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

module.exports = { addOrUpdate, getAll };

