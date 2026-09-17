const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const { createApp } = require('../src/app');
const { seedAdminIfEmpty } = require('../src/services/users');

describe('API smoke', () => {
  const app = createApp();
  let token;
  let usersBackup;
  let requestsBackup;
  let createdRequestId;
  let createdApplicantName;

  beforeAll(async () => {
    // Backup and reset users.json to empty array to ensure clean test state
    const usersFile = path.join(process.cwd(), 'data', 'users.json');
    const requestsFile = path.join(process.cwd(), 'data', 'requests.json');
    usersBackup = await fs.readFile(usersFile, 'utf-8').catch(() => '[]');
    requestsBackup = await fs.readFile(requestsFile, 'utf-8').catch(() => '[]');
    await fs.writeFile(usersFile, '[]', 'utf-8');

    // Seed default admin with password 'admin123'
    await seedAdminIfEmpty();

    // login with default admin seeded
    const res = await request(app).post('/api/auth/login').set('X-Requested-With', 'XMLHttpRequest').send({ email: 'admin@example.com', password: 'admin123' });
    expect(res.status).toBe(200);
    token = res.body.token;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    // Restore original users.json
    const usersFile = path.join(process.cwd(), 'data', 'users.json');
    if (usersBackup) {
      await fs.writeFile(usersFile, usersBackup, 'utf-8');
    }
    const requestsFile = path.join(process.cwd(), 'data', 'requests.json');
    await fs.writeFile(requestsFile, requestsBackup || '[]', 'utf-8');
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  it('POST /api/requests creates item and GET lists it (auth required)', async () => {
    createdApplicantName = `Export disponible ${Date.now()}`;
    const payload = { applicantName: createdApplicantName, email: 't@example.com', cardType: 'etudiants' };
    const created = await request(app).post('/api/requests').set('Authorization', 'Bearer ' + token).set('X-Requested-With', 'XMLHttpRequest').send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toHaveProperty('id');
    createdRequestId = created.body.id;

    const list = await request(app).get('/api/requests').set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
  });

  it('GET /api/requests without token is 401', async () => {
    const res = await request(app).get('/api/requests');
    expect(res.status).toBe(401);
  });

  it('GET /api/requests/export-txt exports only the applicant column', async () => {
    const available = await request(app)
      .patch(`/api/requests/${createdRequestId}/status`)
      .set('Authorization', 'Bearer ' + token)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'disponible' });
    expect(available.status).toBe(200);

    const list = await request(app).get('/api/requests').set('Authorization', 'Bearer ' + token);
    const exported = await request(app).get('/api/requests/export-txt').set('Authorization', 'Bearer ' + token);
    const pendingNames = list.body
      .filter((item) => item.status !== 'disponible')
      .map((item) => item.applicantName);

    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toMatch(/^text\/plain/);
    expect(exported.headers['content-disposition']).toMatch(/demandes-demandeurs-\d{4}-\d{2}-\d{2}\.txt/);
    expect(exported.text).toBe(['Demandeur', ...pendingNames].join('\r\n') + '\r\n');
    expect(exported.text).not.toContain(createdApplicantName);
    expect(exported.text).not.toContain('t@example.com');
    expect(exported.text).not.toContain('etudiants');
  });

  it('GET /api/requests/export-txt without token is 401', async () => {
    const res = await request(app).get('/api/requests/export-txt');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with wrong password is 401', async () => {
    const res = await request(app).post('/api/auth/login').set('X-Requested-With', 'XMLHttpRequest').send({ email: 'admin@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/register creates a new user and appears in GET /api/users', async () => {
    const unique = `user${Date.now()}@example.com`;
    const create = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer ' + token)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ name: 'U Test', email: unique, role: 'requester', password: 'pw12345' });
    expect(create.status).toBe(201);
    const list = await request(app).get('/api/users').set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    const emails = list.body.map((u) => u.email);
    expect(emails).toContain(unique);
  });

  it('POST /api/auth/register returns 409 on duplicate email', async () => {
    const email = `dup-${Date.now()}@example.com`;
    const first = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer ' + token)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ name: 'Dup', email, role: 'requester', password: 'pw12345' });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer ' + token)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ name: 'Dup', email, role: 'requester', password: 'pw12345' });
    expect(second.status).toBe(409);
  });
});
