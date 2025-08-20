const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'calls.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, '[]', 'utf-8');
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(items) {
  await ensureStore();
  await fs.writeFile(FILE, JSON.stringify(items, null, 2), 'utf-8');
}

async function getAll() {
  const items = await readAll();
  // newest first
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function create({ name, location }, user) {
  const items = await readAll();
  const now = new Date().toISOString();
  const nextId = items.length ? Math.max(...items.map((x) => x.id || 0)) + 1 : 1;
  const rec = {
    id: nextId,
    name: String(name).trim(),
    location: String(location).trim(),
    createdAt: now,
    createdById: user && user.id ? user.id : null,
    createdByName: user && (user.name || user.email) ? (user.name || user.email) : null,
  };
  items.push(rec);
  await writeAll(items);
  return rec;
}

async function remove(id) {
  const items = await readAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  await writeAll(items);
  return true;
}

module.exports = { getAll, create, remove };

