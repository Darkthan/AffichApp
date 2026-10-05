const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

describe('Firefox integration OAuth API', () => {
  let app, users, db, oauth, suggestions, admin, requester, directory;
  const originalDirectory = process.cwd();
  const password = 'integration-test-password';
  const redirectUri = 'https://example.extensions.allizom.org/';
  let clientId;

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-integration-test-'));
    process.chdir(directory);
    jest.resetModules();
    users = require('../src/services/users');
    db = require('../src/services/db').db;
    oauth = require('../src/services/oauth');
    suggestions = require('../src/services/suggestions');
    admin = await users.create({ name: 'Admin', email: 'admin@example.test', role: 'admin', password });
    requester = await users.create({ name: 'Requester', email: 'requester@example.test', role: 'requester', password });
    await require('../src/services/cardTypes').seedDefaultsIfEmpty();
    app = require('../src/app').createApp();
    const registered = await request(app).post('/register').send({ client_name: 'Firefox Cards', redirect_uris: [redirectUri] });
    expect(registered.status).toBe(201);
    clientId = registered.body.client_id;
    await require('../src/services/cardTypes').seedDefaultsIfEmpty();
  });

  afterAll(async () => {
    process.chdir(originalDirectory);
    if (directory && path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('cards-integration-test-')) {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  async function login(user, scope = 'cards:read cards:write names:write') {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const authorization = { client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'firefox-state' };
    const page = await request(app).get('/authorize').query(authorization);
    expect(page.status).toBe(200);
    const approved = await request(app).post('/authorize').type('form').send({ ...authorization, email: user.email, password });
    expect(approved.status).toBe(302);
    const callback = new URL(approved.headers.location);
    expect(callback.searchParams.get('state')).toBe('firefox-state');
    const token = await request(app).post('/token').type('form').send({ grant_type: 'authorization_code', client_id: clientId,
      code: callback.searchParams.get('code'), redirect_uri: redirectUri, code_verifier: verifier });
    expect(token.status).toBe(200);
    expect(token.body.scope).toBe(scope);
    return token.body;
  }

  it('discovers scopes, lists pending names, filters and updates statuses', async () => {
    const discovery = await request(app).get('/.well-known/oauth-protected-resource/api/integration');
    expect(discovery.body.scopes_supported).toContain('names:write');
    const token = await login(admin);
    const first = await db.create({ applicantName: 'Carte à faire', cardType: 'etudiants', email: 'private@example.test' }, requester);
    const ready = await db.create({ applicantName: 'Carte prête', cardType: 'etudiants' }, admin);
    await db.updateStatus(ready.id, 'disponible');
    const list = await request(app).get('/api/integration/cards').auth(token.access_token, { type: 'bearer' });
    expect(list.status).toBe(200);
    expect(list.body.map(item => item.id)).toEqual([first.id]);
    expect(list.body[0].email).toBeUndefined();
    const updated = await request(app).patch(`/api/integration/cards/${first.id}/status`).auth(token.access_token, { type: 'bearer' }).send({ status: 'impression' });
    expect(updated.status).toBe(200);
    expect((await db.getById(first.id)).status).toBe('impression');
    const filtered = await request(app).get('/api/integration/cards?status=disponible').auth(token.access_token, { type: 'bearer' });
    expect(filtered.body.map(item => item.id)).toEqual([ready.id]);
    expect((await request(app).get('/api/integration/cards?status=wrong').auth(token.access_token, { type: 'bearer' })).status).toBe(400);
    expect((await request(app).get('/api/integration/card-types').auth(token.access_token, { type: 'bearer' })).body.length).toBeGreaterThan(0);
    expect((await request(app).patch('/api/integration/cards/1x/status').auth(token.access_token, { type: 'bearer' }).send({ status: 'demande' })).status).toBe(400);
    expect((await request(app).patch(`/api/integration/cards/${first.id}/status`).auth(token.access_token, { type: 'bearer' }).send({ status: 'wrong' })).status).toBe(400);
    expect((await request(app).patch('/api/integration/cards/999999/status').auth(token.access_token, { type: 'bearer' }).send({ status: 'demande' })).status).toBe(404);
  });

  it('adds names to existing autocomplete, deduplicates and preserves concurrent additions', async () => {
    const token = await login(admin);
    const add = name => request(app).post('/api/integration/names').auth(token.access_token, { type: 'bearer' }).send({ name, cardType: 'etudiants' });
    expect((await add('  Élodie Martin  ')).status).toBe(200);
    expect((await add('Elodie Martin')).status).toBe(200);
    const concurrent = await Promise.all([add('Alice Dupont'), add('Bob Durand')]);
    expect(concurrent.every(response => response.status === 200)).toBe(true);
    const names = await suggestions.getAll();
    expect(names.filter(item => item.key === 'elodie martin')).toHaveLength(1);
    expect(names.some(item => item.name === 'Alice Dupont')).toBe(true);
    expect(names.some(item => item.name === 'Bob Durand')).toBe(true);
    const jwt = require('../src/services/auth').signToken({ sub: admin.id });
    const autocomplete = await request(app).get('/api/requests/suggestions?q=elodie').auth(jwt, { type: 'bearer' });
    expect(autocomplete.body).toContainEqual({ name: 'Elodie Martin', cardType: 'etudiants' });
    for (const body of [{ name: '' }, { name: 3 }, { name: 'Bad\nName' }, { name: 'Test', cardType: 'unknown' }]) {
      expect((await request(app).post('/api/integration/names').auth(token.access_token, { type: 'bearer' }).send(body)).status).toBe(400);
    }
  });

  it('enforces scopes, account roles and separation from MCP and browser sessions', async () => {
    expect((await request(app).get('/api/integration/cards')).status).toBe(401);
    const readOnly = await login(admin, 'cards:read');
    expect((await request(app).post('/api/integration/names').auth(readOnly.access_token, { type: 'bearer' }).send({ name: 'Denied' })).status).toBe(403);
    const userToken = await login(requester);
    const visible = await request(app).get('/api/integration/cards?status=all').auth(userToken.access_token, { type: 'bearer' });
    expect(visible.body.every(item => item.applicantName !== 'Carte prête')).toBe(true);
    expect((await request(app).patch('/api/integration/cards/1/status').auth(userToken.access_token, { type: 'bearer' }).send({ status: 'disponible' })).status).toBe(403);
    expect((await request(app).post('/api/integration/names').auth(userToken.access_token, { type: 'bearer' }).send({ name: 'Denied' })).status).toBe(403);
    expect(await oauth.verifyAccess(readOnly.access_token)).toBeNull();
    const mcpToken = await login(admin, 'mcp');
    expect((await request(app).get('/api/integration/cards').auth(mcpToken.access_token, { type: 'bearer' })).status).toBe(403);
    const jwt = require('../src/services/auth').signToken({ sub: admin.id });
    expect((await request(app).get('/api/integration/cards').auth(jwt, { type: 'bearer' })).status).toBe(401);
    const refreshed = await request(app).post('/token').type('form').send({ grant_type: 'refresh_token', client_id: clientId, refresh_token: readOnly.refresh_token });
    expect(refreshed.body.scope).toBe('cards:read');
    expect((await request(app).get('/api/integration/cards').auth(readOnly.access_token, { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/api/integration/cards').auth(refreshed.body.access_token, { type: 'bearer' })).status).toBe(200);
  });
});
