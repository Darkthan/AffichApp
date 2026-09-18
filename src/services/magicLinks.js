const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const STORE_FILE = path.join(process.cwd(), 'data', 'magic-links.json');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
let operationQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf-8');
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) { return []; }
    throw error;
  }
}

async function writeAll(items) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function serialize(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => {});
  return result;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(userId, ttlMs = DEFAULT_TTL_MS) {
  return serialize(async () => {
    const now = Date.now();
    const token = crypto.randomBytes(32).toString('base64url');
    const items = (await readAll()).filter((item) => item.expiresAt > now && item.userId !== userId);
    items.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    await writeAll(items);
    return token;
  });
}

async function consume(token) {
  if (typeof token !== 'string' || token.length < 32) { return null; }
  return serialize(async () => {
    const now = Date.now();
    const tokenHash = hashToken(token);
    const items = await readAll();
    const match = items.find((item) => item.tokenHash === tokenHash && item.expiresAt > now);
    const remaining = items.filter((item) => item.tokenHash !== tokenHash && item.expiresAt > now);
    await writeAll(remaining);
    return match ? { userId: match.userId } : null;
  });
}

module.exports = { create, consume, DEFAULT_TTL_MS };
