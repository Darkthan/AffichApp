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
});
