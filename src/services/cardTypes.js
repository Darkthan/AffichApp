const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'card-types.json');

function slugify(label) {
  return String(label)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

async function seedDefaultsIfEmpty() {
  const items = await readAll();
  if (items.length === 0) {
    const now = new Date().toISOString();
    const defaults = [
      { id: 1, code: 'etudiants', label: 'Etudiants', createdAt: now, updatedAt: now },
      { id: 2, code: 'enseignants', label: 'Enseignants', createdAt: now, updatedAt: now },
      { id: 3, code: 'personnels', label: 'Personnels', createdAt: now, updatedAt: now }
    ];
    await writeAll(defaults);
    return defaults;
  }
  return items;
}

async function getAll() {
  return readAll();
}

async function findByCode(code) {
  const items = await readAll();
  return items.find((t) => t.code === code) || null;
}

async function create({ code, label }) {
  const items = await readAll();
  const now = new Date().toISOString();
  const normalized = code && code.trim().length ? code.trim().toLowerCase() : slugify(label);
  if (items.find((t) => t.code === normalized)) {
    const err = new Error('Type code already exists');
    err.code = 'E_DUPLICATE_CODE';
    throw err;
  }
  const nextId = items.length ? Math.max(...items.map((x) => x.id || 0)) + 1 : 1;
  const rec = { id: nextId, code: normalized, label: label.trim(), createdAt: now, updatedAt: now };
  items.push(rec);
  await writeAll(items);
  return rec;
}

async function removeByCode(code) {
  const items = await readAll();
  const normalized = String(code).trim().toLowerCase();
  const idx = items.findIndex((t) => t.code === normalized);
  if (idx === -1) {return false;}
  items.splice(idx, 1);
  await writeAll(items);
  return true;
}

module.exports = { getAll, findByCode, create, removeByCode, seedDefaultsIfEmpty };
