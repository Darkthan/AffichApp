const fs = require('fs').promises;
const path = require('path');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, '[]', 'utf-8');
  }
}

async function seedAdminIfEmpty() {
  const users = await getAll();
  if (users.length === 0) {
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(process.env.ADMIN_DEFAULT_PASSWORD || 'admin123');
    const admin = {
      id: 1,
      name: 'Admin',
      email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@example.com',
      role: 'admin',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    await writeAll([admin]);
    return admin;
  }
  return null;
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(USERS_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(items) {
  await ensureStore();
  await fs.writeFile(USERS_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

async function getAll() {
  return readAll();
}

async function getByEmail(email) {
  const users = await readAll();
  return users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

// single-role version: no getByName/getByLogin

async function getById(id) {
  const users = await readAll();
  return users.find((u) => u.id === id) || null;
}

async function create({ name, email, role, password }) {
  const users = await readAll();
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    const err = new Error('Email already exists');
    err.code = 'E_DUPLICATE_EMAIL';
    throw err;
  }
  const now = new Date().toISOString();
  const nextId = users.length ? Math.max(...users.map((x) => x.id || 0)) + 1 : 1;
  const passwordHash = await hashPassword(password);
  const user = { id: nextId, name, email, role, passwordHash, createdAt: now, updatedAt: now };
  users.push(user);
  await writeAll(users);
  return { id: user.id, name, email, role: mainRole, roles, createdAt: now, updatedAt: now };
}

async function update(id, changes) {
  const users = await readAll();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  if (changes.email) {
    const exists = users.find((u) => u.email.toLowerCase() === changes.email.toLowerCase() && u.id !== id);
    if (exists) {
      const err = new Error('Email already exists');
      err.code = 'E_DUPLICATE_EMAIL';
      throw err;
    }
  }
  const updated = { ...users[idx] };
  if (changes.name != null) updated.name = changes.name;
  if (changes.email != null) updated.email = changes.email;
  if (changes.role != null) updated.role = changes.role;
  if (changes.password != null && changes.password !== '') {
    updated.passwordHash = await hashPassword(changes.password);
  }
  updated.updatedAt = now;
  users[idx] = updated;
  await writeAll(users);
  const { passwordHash, ...safe } = updated;
  return safe;
}

async function remove(id) {
  const users = await readAll();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  users.splice(idx, 1);
  await writeAll(users);
  return true;
}

module.exports = { getAll, getByEmail, getById, create, update, remove, seedAdminIfEmpty };
