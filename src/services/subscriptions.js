const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'subscriptions.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(FILE); } catch { await fs.writeFile(FILE, '[]', 'utf-8'); }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(FILE, 'utf-8');
  try { const data = JSON.parse(raw); return Array.isArray(data) ? data : []; } catch { return []; }
}

async function writeAll(items) { await ensureStore(); await fs.writeFile(FILE, JSON.stringify(items, null, 2), 'utf-8'); }

async function add(userId, sub) {
  const items = await readAll();
  const exists = items.find((x) => x.endpoint === sub.endpoint && x.userId === userId);
  if (exists) { return exists; }
  const rec = { userId, endpoint: sub.endpoint, keys: sub.keys || {}, createdAt: new Date().toISOString() };
  items.push(rec);
  await writeAll(items);
  return rec;
}

async function remove(userId, endpoint) {
  const items = await readAll();
  const idx = items.findIndex((x) => x.userId === userId && x.endpoint === endpoint);
  if (idx === -1) { return false; }
  items.splice(idx, 1);
  await writeAll(items);
  return true;
}

async function listAll() { return readAll(); }

module.exports = { add, remove, listAll };

