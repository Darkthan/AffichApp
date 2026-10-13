const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { getById } = require('./users');

const file = path.join(process.cwd(), 'data', 'personal-tokens.json');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
let queue = Promise.resolve();

async function read() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { return []; } throw error; }
}

function mutate(fn) {
  const operation = queue.then(async () => {
    const records = (await read()).filter(record => record.expiresAt > Date.now());
    const result = fn(records);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
    await fs.rename(temporary, file);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}

function metadata(record) {
  return { id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt, scope: 'mcp' };
}

async function create(user, name, days) {
  const token = `affichapp_pat_${crypto.randomBytes(32).toString('base64url')}`;
  return mutate(records => {
    if (records.filter(record => record.userId === user.id).length >= 20) {
      const error = new Error('Maximum de 20 jetons actifs atteint.');
      error.status = 409;
      throw error;
    }
    const record = { id: crypto.randomBytes(16).toString('hex'), userId: user.id,
      accountCreatedAt: user.createdAt, credentialHash: digest(user.passwordHash),
      hash: digest(token), name, createdAt: Date.now(), expiresAt: Date.now() + days * 86400000 };
    records.push(record);
    return { ...metadata(record), token };
  });
}

async function list(userId) {
  await queue;
  return (await read()).filter(record => record.userId === userId && record.expiresAt > Date.now()).map(metadata);
}

async function revoke(userId, id) {
  return mutate(records => {
    const index = records.findIndex(record => record.userId === userId && record.id === id);
    if (index < 0) { return false; }
    records.splice(index, 1);
    return true;
  });
}

async function verify(token) {
  if (!/^affichapp_pat_[A-Za-z0-9_-]{43}$/.test(token)) { return null; }
  await queue;
  const hash = digest(token);
  const record = (await read()).find(item => item.hash === hash && item.expiresAt > Date.now());
  if (!record) { return null; }
  const user = await getById(record.userId);
  // Bind to the account incarnation, not a reusable numeric ID. Password changes revoke access.
  return user && user.createdAt === record.accountCreatedAt && digest(user.passwordHash) === record.credentialHash ? user : null;
}

module.exports = { create, list, revoke, verify };
