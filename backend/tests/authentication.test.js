// tests/authentication.test.js
// requireAuth: quem e o usuario. (O que ele PODE fazer e testado em
// authorization.test.js.)

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const config = require('../config');
const { bearer, registerAndLogin } = require('./helpers/auth');

// Rota autenticada qualquer, usada apenas para exercitar o middleware.
const ROTA = '/api/v1/auth/me';

describe('requireAuth', () => {
  it('sem token -> 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get(ROTA);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('token invalido -> 401 TOKEN_INVALID', async () => {
    const response = await request(app).get(ROTA).set('Authorization', 'Bearer nao-e-um-jwt');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('token expirado -> 401 TOKEN_EXPIRED', async () => {
    const expired = jwt.sign({ sub: '000000000000000000000000' }, config.jwtSecret, {
      expiresIn: -10,
    });

    const response = await request(app).get(ROTA).set('Authorization', 'Bearer ' + expired);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('token valido de usuario que nao existe mais -> 401 TOKEN_INVALID', async () => {
    const orfao = jwt.sign({ sub: '000000000000000000000000' }, config.jwtSecret, {
      expiresIn: 3600,
    });

    const response = await request(app).get(ROTA).set('Authorization', 'Bearer ' + orfao);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('aceita Authorization: Bearer', async () => {
    const { token } = await registerAndLogin();

    await request(app).get(ROTA).set(bearer(token)).expect(200);
  });

  it('mantem o header legado x-auth-token', async () => {
    const { token } = await registerAndLogin();

    await request(app).get(ROTA).set('x-auth-token', token).expect(200);
  });
});
