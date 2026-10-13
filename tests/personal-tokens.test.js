const request = require('supertest');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('Personal MCP tokens', () => {
  let directory, app, users, db, service, owner, other, jwt, otherJwt;
  const originalDirectory = process.cwd();
  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-pat-test-'));
    process.chdir(directory);
    jest.resetModules();
    users = require('../src/services/users');
    db = require('../src/services/db').db;
    service = require('../src/services/personalTokens');
    owner = await users.create({ name: 'Owner', email: 'owner@example.test', role: 'requester', password: 'test-password' });
    other = await users.create({ name: 'Other', email: 'other@example.test', role: 'admin', password: 'test-password' });
    const auth = require('../src/services/auth');
    jwt = auth.signToken({ sub: owner.id });
    otherJwt = auth.signToken({ sub: other.id });
    app = require('../src/app').createApp();
    await require('../src/services/cardTypes').seedDefaultsIfEmpty();
  });
  afterAll(async () => {
    process.chdir(originalDirectory);
    if (directory && path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('cards-pat-test-')) {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  const manage = (method, bearer = jwt, suffix = '') => request(app)[method](`/api/personal-tokens${suffix}`)
    .auth(bearer, { type: 'bearer' }).set('X-Requested-With', 'XMLHttpRequest');
  const create = () => manage('post').send({ name: 'iPhone', expiresInDays: 90 });
  const rpc = (token, method = 'tools/list', params = {}) => request(app).post('/mcp').auth(token, { type: 'bearer' })
    .set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', id: 1, method, params });

  it('issues a one-time secret, accepts Streamable HTTP and isolates account data', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const { token, id } = created.body;
    expect(token).toMatch(/^affichapp_pat_[A-Za-z0-9_-]{43}$/);
    const stored = await fs.readFile(path.join(directory, 'data', 'personal-tokens.json'), 'utf8');
    expect(stored).not.toContain(token);
    expect(JSON.parse(stored)[0].hash).toHaveLength(64);
    const listed = await manage('get');
    expect(listed.body).toContainEqual(expect.objectContaining({ id, name: 'iPhone', scope: 'mcp' }));
    expect(JSON.stringify(listed.body)).not.toMatch(/hash|token|credential/i);
    expect((await manage('get', otherJwt)).body).toEqual([]);
    const initialized = await rpc(token, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'iPhone', version: '1' } });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.serverInfo.name).toBe('demandes-cartes');
    expect((await rpc(token)).body.result.tools.length).toBe(6);
    const mine = await db.create({ applicantName: 'Owner card', cardType: 'etudiants' }, owner);
    const theirs = await db.create({ applicantName: 'Other card', cardType: 'etudiants' }, other);
    const list = await rpc(token, 'tools/call', { name: 'list_requests', arguments: {} });
    expect(JSON.parse(list.body.result.content[0].text).map(item => item.id)).toEqual([mine.id]);
    for (const name of ['get_request', 'update_applicant_name', 'update_request_status']) {
      const denied = await rpc(token, 'tools/call', { name, arguments: { id: theirs.id, applicantName: 'Denied', status: 'impression' } });
      expect(denied.body.result.isError).toBe(true);
    }
    expect((await manage('delete', otherJwt, `/${id}`)).status).toBe(404);
    expect((await rpc(token)).status).toBe(200);
    await users.update(owner.id, { role: 'appel' });
    const deniedCreate = await rpc(token, 'tools/call', { name: 'create_request', arguments: { applicantName: 'Denied', cardType: 'etudiants' } });
    expect(deniedCreate.body.result.isError).toBe(true);
    const changed = await rpc(token, 'tools/call', { name: 'update_request_status', arguments: { id: theirs.id, status: 'impression' } });
    expect(changed.body.result.isError).not.toBe(true);
    await users.update(owner.id, { role: 'requester' });
    expect((await manage('delete', jwt, `/${id}`)).status).toBe(204);
    expect((await rpc(token)).status).toBe(401);
  });

  it('rejects invalid credentials, CSRF, unrelated API use and credential delegation', async () => {
    expect((await request(app).get('/api/personal-tokens')).status).toBe(401);
    expect((await request(app).post('/api/personal-tokens').auth(jwt, { type: 'bearer' }).send({ name: 'CSRF' })).status).toBe(403);
    for (const body of [{ name: '' }, { name: 1 }, { name: 'a'.repeat(81) }, { name: 'a', expiresInDays: 0 },
      { name: 'a', expiresInDays: 366 }, { name: 'a', expiresInDays: '90' }]) {
      expect((await manage('post').send(body)).status).toBe(400);
    }
    const { token } = (await create()).body;
    expect((await manage('get', token)).status).toBe(401);
    expect((await manage('post', token).send({ name: 'delegated' })).status).toBe(401);
    expect((await request(app).get('/api/auth/me').auth(token, { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/api/integration/cards').auth(token, { type: 'bearer' })).status).toBe(401);
    expect((await rpc(jwt)).status).toBe(401);
    expect((await rpc(`${token.slice(0, -1)}!`)).status).toBe(401);
    expect((await request(app).post(`/mcp?token=${token}`).send({})).status).toBe(401);
    expect((await rpc(token).set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await request(app).get('/mcp').auth(token, { type: 'bearer' })).status).toBe(405);
    const apiKeys = require('../src/services/apiKeys');
    const { rawKey } = await apiKeys.create('Service', 'admin');
    expect((await manage('get').set('X-API-Key', rawKey)).status).toBe(401);
    expect((await request(app).post('/mcp').set('X-API-Key', rawKey).send({})).status).toBe(401);
  });

  it('expires tokens and invalidates them on password change, deletion or ID reuse', async () => {
    const first = (await create()).body;
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 91 * 86400000);
    try { expect(await service.verify(first.token)).toBeNull(); } finally { spy.mockRestore(); }
    const next = (await create()).body;
    await users.update(owner.id, { password: 'changed-password' });
    expect((await rpc(next.token)).status).toBe(401);
    const last = (await create()).body;
    const deletedAccount = await users.getById(owner.id);
    await users.remove(owner.id);
    expect((await rpc(last.token)).status).toBe(401);
    const usersFile = path.join(directory, 'data', 'users.json');
    const records = JSON.parse(await fs.readFile(usersFile, 'utf8'));
    const replacement = { ...deletedAccount, createdAt: 'replacement-account' };
    records.push(replacement);
    await fs.writeFile(usersFile, JSON.stringify(records));
    expect((await rpc(last.token)).status).toBe(401);
  });

  it('preserves concurrent tokens, enforces the account cap and requires HTTPS in production', async () => {
    const account = await users.getById(other.id);
    const issued = await Promise.all(Array.from({ length: 20 }, (_, index) => service.create(account, `Device ${index}`, 30)));
    expect(new Set(issued.map(item => item.token)).size).toBe(20);
    expect(await service.list(other.id)).toHaveLength(20);
    await expect(service.create(account, 'Over limit', 30)).rejects.toMatchObject({ status: 409 });
    await Promise.all(issued.slice(0, 10).map(item => service.revoke(other.id, item.id)));
    expect(await service.list(other.id)).toHaveLength(10);
    expect(await service.verify(issued[0].token)).toBeNull();
    expect((await rpc(issued[19].token)).status).toBe(200);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect((await rpc(issued[19].token)).status).toBe(403);
      expect((await manage('get', otherJwt)).status).toBe(403);
      expect((await rpc(issued[19].token).set('X-Forwarded-Proto', 'https')).status).toBe(200);
      expect((await manage('get', otherJwt).set('X-Forwarded-Proto', 'https')).status).toBe(200);
    } finally { process.env.NODE_ENV = previous; }
  });
});
