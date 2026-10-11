// tests/envelope.test.js
// Fase 0 — nenhuma resposta nasce fora do envelope, e nenhum erro vaza stack trace.

const request = require('supertest');
const app = require('../app');

describe('envelope de erro', () => {
  it('rota inexistente -> 404 ROUTE_NOT_FOUND', async () => {
    const response = await request(app).get('/api/v1/rota-que-nao-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it('o requestId do corpo e o mesmo do header X-Request-Id', async () => {
    const response = await request(app).get('/api/v1/rota-que-nao-existe');

    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('reaproveita o X-Request-Id enviado pelo cliente', async () => {
    const requestId = '11111111-2222-3333-4444-555555555555';
    const response = await request(app)
      .get('/api/v1/rota-que-nao-existe')
      .set('X-Request-Id', requestId);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body.error.requestId).toBe(requestId);
  });

  it('JSON malformado -> 400 VALIDATION_ERROR (nao 500)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('nenhuma resposta de erro vaza stack trace', async () => {
    const response = await request(app).get('/api/v1/rota-que-nao-existe');

    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.js:[0-9]+/);
  });
});

describe('alias de compatibilidade', () => {
  it('/api continua respondendo (frontend atual)', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('/api e /api/v1 devolvem a mesma coisa', async () => {
    const v1 = await request(app).get('/api/v1/health');
    const legacy = await request(app).get('/api/health');

    expect(legacy.body.data.status).toBe(v1.body.data.status);
  });
});
