// tests/hardening.test.js
// Fase 5 — cabeçalhos de segurança, CORS por ambiente e limite de tentativas.
//
// O limite é RELIGADO aqui, antes de importar o app: o resto da suíte o desliga porque
// faz centenas de logins (ver tests/setup.js). Estas três linhas precisam vir antes do
// require do app — a configuração é lida no momento em que ele é carregado.
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

const request = require('supertest');
const app = require('../app');
const { registerAndLogin } = require('./helpers/auth');

describe('cabecalhos de seguranca', () => {
  it('aplica os cabecalhos do helmet', async () => {
    const resposta = await request(app).get('/api/v1/health');

    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['x-frame-options']).toBeDefined();
    expect(resposta.headers['strict-transport-security']).toBeDefined();
  });

  it('nao anuncia o servidor', async () => {
    const resposta = await request(app).get('/api/v1/health');

    expect(resposta.headers['x-powered-by']).toBeUndefined();
  });

  it('nao aplica CSP: a API nao serve HTML', async () => {
    const resposta = await request(app).get('/api/v1/health');

    expect(resposta.headers['content-security-policy']).toBeUndefined();
  });
});

describe('CORS por ambiente', () => {
  it('libera origem conhecida e expoe o X-Request-Id', async () => {
    const resposta = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');

    expect(resposta.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(resposta.headers['access-control-expose-headers']).toMatch(/X-Request-Id/i);
  });

  it('nao libera origem desconhecida (e nao quebra com 500)', async () => {
    const resposta = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://origem-nao-autorizada.example');

    // Sem o cabecalho, o navegador bloqueia. A requisicao em si nao vira erro.
    expect(resposta.headers['access-control-allow-origin']).toBeUndefined();
    expect(resposta.status).toBe(200);
  });
});

describe('limite de tentativas no login', () => {
  it('bloqueia com 429 no envelope depois de esgotar o limite', async () => {
    // Limite configurado em 3 para este arquivo.
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ninguem@example.com', password: 'senha-errada' })
        .expect(401);
    }

    const bloqueado = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ninguem@example.com', password: 'senha-errada' });

    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.code).toBe('RATE_LIMITED');
    // Mesmo envelope do resto da API, com requestId para correlacionar no log.
    expect(bloqueado.body.error.requestId).toBe(bloqueado.headers['x-request-id']);
  });

  it('nao limita o resto da API', async () => {
    // O limite acima ja foi esgotado neste arquivo; a agenda continua respondendo.
    await request(app).get('/api/v1/health').expect(200);
  });

  it('tambem protege o registro', async () => {
    const resposta = await request(app).post('/api/v1/auth/register').send({
      name: 'Alguem',
      username: 'alguem',
      email: 'alguem@example.com',
      password: 'senha12345',
    });

    expect(resposta.status).toBe(429);
    expect(resposta.body.error.code).toBe('RATE_LIMITED');
  });
});
