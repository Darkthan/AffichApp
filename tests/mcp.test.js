const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { createApp } = require('../src/app');
const users = require('../src/services/users');
const { db } = require('../src/services/db');

describe('MCP OAuth', () => {
  const app = createApp();
  const oauthFile = path.join(process.cwd(), 'data', 'oauth.json');
  let backup;
  let user;

  beforeAll(async () => {
    backup = await fs.readFile(oauthFile).catch(() => null);
    user = await users.create({ name: 'MCP test', email: `mcp-${Date.now()}@example.test`, role: 'requester', password: 'test-password-123' });
  });

  afterAll(async () => {
    if (user) { await users.remove(user.id); }
    if (backup) { await fs.writeFile(oauthFile, backup); }
    else { await fs.unlink(oauthFile).catch(() => {}); }
  });

  it('discovers OAuth, exchanges a PKCE code and lists MCP tools', async () => {
    const protectedResource = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(protectedResource.body.resource).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const metadata = await request(app).get('/.well-known/oauth-authorization-server');
    expect(metadata.body.code_challenge_methods_supported).toContain('S256');

    const unauthorized = await request(app).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers['www-authenticate']).toContain('oauth-protected-resource/mcp');

    const redirectUri = 'http://localhost:9876/callback';
    const registration = await request(app).post('/register').send({ client_name: 'Test MCP', redirect_uris: [redirectUri] });
    expect(registration.status).toBe(201);
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const authorization = {
      client_id: registration.body.client_id, redirect_uri: redirectUri, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', state: 'test-state', scope: 'mcp'
    };
    const page = await request(app).get('/authorize').query(authorization);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Test MCP');
    const approved = await request(app).post('/authorize').type('form').send({ ...authorization, email: user.email, password: 'test-password-123' });
    expect(approved.status).toBe(302);
    const callback = new URL(approved.headers.location);
    expect(callback.searchParams.get('state')).toBe('test-state');

    const rejected = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', client_id: registration.body.client_id, code: callback.searchParams.get('code'),
      redirect_uri: redirectUri, code_verifier: crypto.randomBytes(32).toString('base64url')
    });
    expect(rejected.status).toBe(400);

    const approvedAgain = await request(app).post('/authorize').type('form').send({ ...authorization, email: user.email, password: 'test-password-123' });
    const code = new URL(approvedAgain.headers.location).searchParams.get('code');
    const token = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', client_id: registration.body.client_id, code,
      redirect_uri: redirectUri, code_verifier: verifier
    });
    expect(token.status).toBe(200);
    const mcp = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    expect(mcp.status).toBe(200);
    expect(mcp.body.result.serverInfo.name).toBe('demandes-cartes');
    const tools = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(tools.status).toBe(200);
    expect(tools.body.result.tools.map((tool) => tool.name)).toContain('list_requests');
    const listed = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_requests', arguments: {} } });
    expect(listed.status).toBe(200);
    expect(JSON.parse(listed.body.result.content[0].text).every((item) => item.ownerId === user.id)).toBe(true);

    const applicantName = `Inconnu MCP ${Date.now()}`;
    const createInput = { applicantName, cardType: 'etudiants' };
    const ask = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'create_request', arguments: createInput } });
    expect(JSON.parse(ask.body.result.content[0].text).needsConfirmation).toBe(true);
    expect((await db.getAll()).some((item) => item.applicantName === applicantName)).toBe(false);
    const created = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'create_request', arguments: { ...createInput, confirmUnknownName: true, personCategory: 'eleve' } } });
    const newRequest = JSON.parse(created.body.result.content[0].text);
    expect(newRequest.applicantName).toBe(applicantName);
    await db.remove(newRequest.id);

    const renewed = await request(app).post('/token').type('form').send({
      grant_type: 'refresh_token', client_id: registration.body.client_id, refresh_token: token.body.refresh_token
    });
    expect(renewed.status).toBe(200);
    expect(renewed.body.access_token).not.toBe(token.body.access_token);
    const oldToken = await request(app).post('/mcp').set('Authorization', `Bearer ${token.body.access_token}`)
      .send({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} });
    expect(oldToken.status).toBe(401);
  });
});
