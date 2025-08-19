const request = require('supertest');
const { createApp } = require('../src/app');

describe('API smoke', () => {
  const app = createApp();
  let token;

  beforeAll(async () => {
    // login with default admin seeded
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin123' });
    expect(res.status).toBe(200);
    token = res.body.token;
    expect(token).toBeTruthy();
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });

  it('POST /api/requests creates item and GET lists it (auth required)', async () => {
    const payload = { applicantName: 'Test', email: 't@example.com', cardType: 'etudiants' };
    const created = await request(app).post('/api/requests').set('Authorization', 'Bearer ' + token).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toHaveProperty('id');

    const list = await request(app).get('/api/requests').set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
  });

  it('GET /api/requests without token is 401', async () => {
    const res = await request(app).get('/api/requests');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with wrong password is 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/register creates a new user and appears in GET /api/users', async () => {
    const unique = `user${Date.now()}@example.com`;
    const create = await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'U Test', email: unique, role: 'requester', password: 'pw12345' });
    expect(create.status).toBe(201);
    const list = await request(app).get('/api/users').set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    const emails = list.body.map((u) => u.email);
    expect(emails).toContain(unique);
  });
});
