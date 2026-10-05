const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(process.cwd(), 'data');
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');

let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(KEYS_FILE);
  } catch {
    await fs.writeFile(KEYS_FILE, '[]', 'utf-8');
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(KEYS_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(items) {
  await ensureStore();
  writeQueue = writeQueue.then(() =>
    fs.writeFile(KEYS_FILE, JSON.stringify(items, null, 2), 'utf-8')
  );
  return writeQueue;
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Crée une nouvelle clé d'API.
 * @param {string} name - Nom/description de la clé
 * @param {string} role - Rôle associé : 'admin' | 'requester' | 'appel'
 * @returns {{ record: object, rawKey: string }} La clé en clair (afficher une seule fois) + l'enregistrement stocké
 */
async function create(name, role) {
  const keys = await readAll();
  const rawKey = 'adc_' + crypto.randomBytes(32).toString('hex');
  const keyHash = hashKey(rawKey);
  const now = new Date().toISOString();
  const nextId = keys.length ? Math.max(...keys.map((k) => k.id || 0)) + 1 : 1;

  const record = {
    id: nextId,
    name,
    role,
    keyHash,
    createdAt: now,
    lastUsedAt: null,
  };

  keys.push(record);
  await writeAll(keys);
  return { record, rawKey };
}

/**
 * Valide une clé d'API brute et retourne le record associé (sans le hash).
 * Met à jour lastUsedAt.
 */
async function validate(rawKey) {
  if (!rawKey || !rawKey.startsWith('adc_')) { return null; }
  const keyHashBuf = Buffer.from(hashKey(rawKey), 'hex');
  const keys = await readAll();
  const idx = keys.findIndex((k) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(k.keyHash, 'hex'), keyHashBuf);
    } catch { return false; }
  });
  if (idx === -1) { return null; }

  // Mise à jour de lastUsedAt en arrière-plan (sans bloquer la requête)
  keys[idx].lastUsedAt = new Date().toISOString();
  writeAll(keys).catch(() => {});

  const { keyHash: _h, ...safe } = keys[idx];
  return safe;
}

/**
 * Liste toutes les clés sans exposer les hashes.
 */
async function getAll() {
  const keys = await readAll();
  return keys.map(({ keyHash: _h, ...safe }) => safe);
}

/**
 * Révoque (supprime) une clé par son id.
 */
async function remove(id) {
  const keys = await readAll();
  const idx = keys.findIndex((k) => k.id === id);
  if (idx === -1) { return false; }
  keys.splice(idx, 1);
  await writeAll(keys);
  return true;
}

module.exports = { create, validate, getAll, remove };
