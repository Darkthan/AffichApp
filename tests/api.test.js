const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const { createApp } = require('../src/app');
const { seedAdminIfEmpty } = require('../src/services/users');

describe('API smoke', () => {
  const app = createApp();
  let token;
  let usersBackup;
  let requestsBackup;
  let magicLinksBackup;
  let magicLinksFileExisted;
  let settingsBackup;
  let settingsFileExisted;
  let createdRequestId;
  let createdApplicantName;

  beforeAll(async () => {
    // Backup and reset users.json to empty array to ensure clean test state
    const usersFile = path.join(process.cwd(), 'data', 'users.json');
    const requestsFile = path.join(process.cwd(), 'data', 'requests.json');
    const magicLinksFile = path.join(process.cwd(), 'data', 'magic-links.json');
    const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
    usersBackup = await fs.readFile(usersFile, 'utf-8').catch(() => '[]');
    requestsBackup = await fs.readFile(requestsFile, 'utf-8').catch(() => '[]');
    magicLinksBackup = await fs.readFile(magicLinksFile, 'utf-8').catch(() => null);
    magicLinksFileExisted = magicLinksBackup !== null;
    settingsBackup = await fs.readFile(settingsFile, 'utf-8').catch(() => null);
    settingsFileExisted = settingsBackup !== null;
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
    const magicLinksFile = path.join(process.cwd(), 'data', 'magic-links.json');
    if (magicLinksFileExisted) { await fs.writeFile(magicLinksFile, magicLinksBackup, 'utf-8'); }
    else { await fs.unlink(magicLinksFile).catch((error) => { if (error.code !== 'ENOENT') { throw error; } }); }
    const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
    if (settingsFileExisted) { await fs.writeFile(settingsFile, settingsBackup, 'utf-8'); }
    else { await fs.unlink(settingsFile).catch((error) => { if (error.code !== 'ENOENT') { throw error; } }); }
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

  it('creates and consumes a one-time magic link', async () => {
    const requested = await request(app)
      .post('/api/auth/magic-link/request')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'admin@example.com' });
    expect(requested.status).toBe(202);
    expect(requested.body.magicLink).toBeTruthy();

    const tokenFromLink = new URL(requested.body.magicLink).searchParams.get('magic_token');
    const verified = await request(app)
      .post('/api/auth/magic-link/verify')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ token: tokenFromLink });
    expect(verified.status).toBe(200);
    expect(verified.body.token).toBeTruthy();
    expect(verified.body.user.email).toBe('admin@example.com');

    const reused = await request(app)
      .post('/api/auth/magic-link/verify')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ token: tokenFromLink });
    expect(reused.status).toBe(401);
  });

  it('does not reveal whether a magic-link account exists', async () => {
    const requested = await request(app)
      .post('/api/auth/magic-link/request')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'unknown@example.com' });
    expect(requested.status).toBe(202);
    expect(requested.body.magicLink).toBeUndefined();
  });

  it('stores fallback SMTP settings with an encrypted password and keeps environment priority', async () => {
    const names = ['APP_BASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'SETTINGS_ENCRYPTION_KEY'];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    names.forEach((name) => { delete process.env[name]; });
    process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-encryption-key';

    try {
      const saved = await request(app)
        .patch('/api/settings/magic-link')
        .set('Authorization', 'Bearer ' + token)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          appBaseUrl: 'https://cartes.example.com',
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'mailer',
          smtpPass: 'very-secret-password',
          mailFrom: 'Cartes <no-reply@example.com>',
        });
      expect(saved.status).toBe(200);
      expect(saved.body.configured).toBe(true);
      expect(saved.body.passwordConfigured).toBe(true);
      expect(saved.body.smtpPass).toBeUndefined();

      const settingsFile = path.join(process.cwd(), 'data', 'settings.json');
      const stored = await fs.readFile(settingsFile, 'utf-8');
      expect(stored).not.toContain('very-secret-password');
      expect(JSON.parse(stored).magicLink.smtpPassEncrypted).toMatch(/^enc:v1:/);

      const verify = jest.fn().mockResolvedValue(true);
      const transportSpy = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ verify });
      try {
        const smtpTest = await request(app)
          .post('/api/settings/magic-link/test-smtp')
          .set('Authorization', 'Bearer ' + token)
          .set('X-Requested-With', 'XMLHttpRequest');
        expect(smtpTest.status).toBe(200);
        expect(smtpTest.body.ok).toBe(true);
        expect(verify).toHaveBeenCalledTimes(1);

        const timeout = new Error('Connection timeout');
        timeout.code = 'ETIMEDOUT';
        verify.mockRejectedValueOnce(timeout);
        const failedTest = await request(app)
          .post('/api/settings/magic-link/test-smtp')
          .set('Authorization', 'Bearer ' + token)
          .set('X-Requested-With', 'XMLHttpRequest');
        expect(failedTest.status).toBe(504);
        expect(failedTest.body.reason).toBe('timeout');
      } finally {
        transportSpy.mockRestore();
      }

      process.env.SMTP_HOST = 'smtp.from-environment.example';
      const effective = await request(app)
        .get('/api/settings/magic-link')
        .set('Authorization', 'Bearer ' + token);
      expect(effective.status).toBe(200);
      expect(effective.body.smtpHost).toBe('smtp.from-environment.example');
      expect(effective.body.environmentOverrides.smtpHost).toBe(true);
      expect(effective.body.smtpPass).toBeUndefined();
    } finally {
      names.forEach((name) => {
        if (previous[name] === undefined) { delete process.env[name]; }
        else { process.env[name] = previous[name]; }
      });
    }
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
