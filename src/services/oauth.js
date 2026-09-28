const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const file = path.join(process.cwd(), 'data', 'oauth.json');
let queue = Promise.resolve();
const random = () => crypto.randomBytes(32).toString('base64url');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function read() {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { return { clients: [], codes: [], tokens: [] }; } throw error; }
}

async function mutate(fn) {
  const operation = queue.then(async () => {
    const data = await read();
    const now = Date.now();
    data.codes = data.codes.filter((entry) => entry.expires > now);
    data.tokens = data.tokens.filter((entry) => entry.expires > now);
    const result = await fn(data);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temporary, file);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}

async function registerClient(name, redirectUris) {
  return mutate((data) => {
    const client = { client_id: random(), client_name: name, redirect_uris: redirectUris, token_endpoint_auth_method: 'none' };
    data.clients.push(client);
    return client;
  });
}

async function getClient(id) {
  await queue;
  return (await read()).clients.find((entry) => entry.client_id === id) || null;
}

async function createCode(clientId, redirectUri, challenge, userId) {
  const code = random();
  await mutate((data) => data.codes.push({ hash: digest(code), clientId, redirectUri, challenge, userId, expires: Date.now() + 5 * 60 * 1000 }));
  return code;
}

async function exchangeCode(code, clientId, redirectUri, verifier) {
  return mutate((data) => {
    const index = data.codes.findIndex((entry) => entry.hash === digest(code));
    if (index < 0) { return null; }
    const [entry] = data.codes.splice(index, 1);
    if (entry.clientId !== clientId || entry.redirectUri !== redirectUri || entry.expires <= Date.now()) { return null; }
    const calculated = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (calculated.length !== entry.challenge.length || !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(entry.challenge))) { return null; }
    const access = random();
    const refresh = random();
    data.tokens.push({ accessHash: digest(access), refreshHash: digest(refresh), clientId, userId: entry.userId, expires: Date.now() + 30 * 24 * 60 * 60 * 1000, accessExpires: Date.now() + 60 * 60 * 1000 });
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: 'mcp' };
  });
}

async function refreshToken(token, clientId) {
  return mutate((data) => {
    const entry = data.tokens.find((item) => item.refreshHash === digest(token) && item.clientId === clientId);
    if (!entry || entry.expires <= Date.now()) { return null; }
    const access = random();
    const refresh = random();
    entry.accessHash = digest(access);
    entry.refreshHash = digest(refresh);
    entry.expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    entry.accessExpires = Date.now() + 60 * 60 * 1000;
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600, scope: 'mcp' };
  });
}

async function verifyAccess(token) {
  await queue;
  const entry = (await read()).tokens.find((item) => item.accessHash === digest(token) && item.accessExpires > Date.now());
  return entry ? entry.userId : null;
}

module.exports = { registerClient, getClient, createCode, exchangeCode, refreshToken, verifyAccess };
