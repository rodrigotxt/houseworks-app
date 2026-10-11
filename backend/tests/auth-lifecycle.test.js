// tests/auth-lifecycle.test.js
// Fase 5 — ciclo de vida da sessao: cookie, logout (com revogacao real) e refresh.

const request = require('supertest');
const app = require('../app');
const { bearer, registerAndLogin } = require('./helpers/auth');

const ROTA_PRIVADA = '/api/v1/auth/me';

function cookieDe(resposta) {
  const cabecalhos = resposta.headers['set-cookie'];
  return Array.isArray(cabecalhos) ? cabecalhos.join('; ') : String(cabecalhos || '');
}

describe('login e cookie', () => {
  it('define o cookie httpOnly jwt_token', async () => {
    const { user } = await registerAndLogin();

    const resposta = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });

    const cookie = cookieDe(resposta);

    expect(resposta.status).toBe(200);
    expect(cookie).toMatch(/jwt_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('o cookie sozinho autentica, sem header nenhum', async () => {
    const { user } = await registerAndLogin();

    const agente = request.agent(app);
    await agente.post('/api/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);

    // Nenhum header Authorization: quem carrega a sessao e o cookie.
    await agente.get(ROTA_PRIVADA).expect(200);
  });
});

describe('logout', () => {
  it('responde 204 e limpa o cookie', async () => {
    const { user } = await registerAndLogin();

    const agente = request.agent(app);
    await agente.post('/api/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);

    const resposta = await agente.post('/api/v1/auth/logout');

    expect(resposta.status).toBe(204);
    expect(cookieDe(resposta)).toMatch(/jwt_token=;|jwt_token=$/);
  });

  it('REVOGA o token: o mesmo JWT deixa de valer', async () => {
    const { user, token } = await registerAndLogin();

    await request(app).get(ROTA_PRIVADA).set(bearer(token)).expect(200);
    await request(app).post('/api/v1/auth/logout').set(bearer(token)).expect(204);

    // Sem revogacao, sair so apagaria o cookie e um token copiado continuaria valendo.
    const depois = await request(app).get(ROTA_PRIVADA).set(bearer(token));

    expect(depois.status).toBe(401);
    expect(depois.body.error.code).toBe('TOKEN_INVALID');
  });

  it('sem token -> 401', async () => {
    await request(app).post('/api/v1/auth/logout').expect(401);
  });
});

describe('refresh', () => {
  it('emite um token novo e revoga o antigo (rotacao)', async () => {
    const { token } = await registerAndLogin();

    const resposta = await request(app).post('/api/v1/auth/refresh').set(bearer(token));

    expect(resposta.status).toBe(200);
    expect(typeof resposta.body.data.token).toBe('string');
    expect(resposta.body.data.token).not.toBe(token);
    expect(resposta.body.data.expiresIn).toBe(3600);

    // O novo vale.
    await request(app).get(ROTA_PRIVADA).set(bearer(resposta.body.data.token)).expect(200);

    // O antigo nao vale mais: uma sessao renovada nao deixa dois tokens circulando.
    const antigo = await request(app).get(ROTA_PRIVADA).set(bearer(token));

    expect(antigo.status).toBe(401);
    expect(antigo.body.error.code).toBe('TOKEN_INVALID');
  });

  it('renova o cookie tambem', async () => {
    const { user } = await registerAndLogin();

    const agente = request.agent(app);
    await agente.post('/api/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);

    const resposta = await agente.post('/api/v1/auth/refresh');

    expect(resposta.status).toBe(200);
    expect(cookieDe(resposta)).toMatch(/jwt_token=/);

    await agente.get(ROTA_PRIVADA).expect(200);
  });

  it('token ja revogado nao renova', async () => {
    const { token } = await registerAndLogin();

    await request(app).post('/api/v1/auth/refresh').set(bearer(token)).expect(200);

    const segunda = await request(app).post('/api/v1/auth/refresh').set(bearer(token));

    expect(segunda.status).toBe(401);
  });

  it('sem token -> 401', async () => {
    await request(app).post('/api/v1/auth/refresh').expect(401);
  });
});
