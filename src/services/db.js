const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'requests.json');

let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, '[]', 'utf-8');
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(DB_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(items) {
  await ensureStore();
  // Serialize writes to avoid race conditions
  writeQueue = writeQueue.then(() => fs.writeFile(DB_FILE, JSON.stringify(items, null, 2), 'utf-8'));
  return writeQueue;
}

async function getAll() {
  return readAll();
}

async function getById(id) {
  const items = await readAll();
  return items.find((x) => x.id === id) || null;
}

async function create(payload, owner) {
  const items = await readAll();
  const now = new Date().toISOString();
  const nextId = items.length ? Math.max(...items.map((x) => x.id || 0)) + 1 : 1;
  const record = {
    id: nextId,
    applicantName: payload.applicantName,
    email: payload.email,
    cardType: payload.cardType,
    details: payload.details || null,
    status: 'demande',
    ownerId: owner && owner.id ? owner.id : null,
    createdAt: now,
    updatedAt: now,
  };
  items.push(record);
  await writeAll(items);
  return record;
}

async function updateStatus(id, status) {
  const items = await readAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  items[idx].status = status;
  items[idx].updatedAt = new Date().toISOString();
  await writeAll(items);
  return items[idx];
}

async function remove(id) {
  const items = await readAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  await writeAll(items);
  return true;
}

const db = { getAll, getById, create, updateStatus, remove };

module.exports = { db };
