// tests/health.test.js
// Fase 0 — o contrato precisa ter um endpoint de smoke test sem autenticacao.

const request = require('supertest');
const app = require('../app');

describe('GET /api/v1/health', () => {
  it('responde 200 no envelope { data }', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'ok', database: 'connected' });
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
    expect(response.body.data.version).toBeDefined();
  });

  it('nao exige autenticacao', async () => {
    await request(app).get('/api/v1/health').expect(200);
  });

  it('devolve o header X-Request-Id', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
