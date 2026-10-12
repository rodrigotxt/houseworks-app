// tests/auth-lifecycle.test.js
// Fase 5 — ciclo de vida da sessao: cookie, logout (com revogacao real) e refresh.

const request = require('supertest');
const jwt = require('jsonwebtoken');

const app = require('../app');
const config = require('../config');
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

// A janela de sessao: o token e curto (1h), mas a SESSAO dura 30 dias. O refresh aceita
// um token ja expirado enquanto ela estiver de pe — era isso que faltava, e o motivo pelo
// qual a renovacao nunca funcionava: exigir token valido para renovar torna a renovacao
// impossivel exatamente quando ela e precisa.
//
// O sintoma so aparecia depois de uma hora parado: a pagina seguinte caia no login.
describe('janela de sessao', () => {
  // Token com idade controlada: emitido `segundosAtras + 1h` atras, portanto expirado ha
  // exatamente `segundosAtras`.
  // O id do usuario sai do proprio token porque o helper `registerAndLogin` devolve o
  // objeto de ENTRADA (nome, email, senha), nao o usuario criado.
  function idDe(token) {
    return jwt.decode(token).sub;
  }

  function tokenExpiradoHa(userId, segundosAtras) {
    const emitidoEm = Math.floor(Date.now() / 1000) - segundosAtras - 3600;

    return jwt.sign(
      { sub: userId, iat: emitidoEm, exp: emitidoEm + 3600 },
      config.jwtSecret,
      { jwtid: 'teste-janela-' + Math.random().toString(36).slice(2) }
    );
  }

  it('token expirado ha segundos RENOVA (era o que nao acontecia)', async () => {
    const { token } = await registerAndLogin();
    const expirado = tokenExpiradoHa(idDe(token), 5);

    const resposta = await request(app).post('/api/v1/auth/refresh').set(bearer(expirado));

    expect(resposta.status).toBe(200);
    expect(typeof resposta.body.data.token).toBe('string');

    // E o token novo vale de verdade.
    await request(app).get(ROTA_PRIVADA).set(bearer(resposta.body.data.token)).expect(200);
  });

  it('expirado nao serve para ROTAS NORMAIS, so para renovar', async () => {
    const { token } = await registerAndLogin();
    const expirado = tokenExpiradoHa(idDe(token), 5);

    // Tolerar a expiracao no refresh nao pode virar tolerar em todo lugar.
    const resposta = await request(app).get(ROTA_PRIVADA).set(bearer(expirado));

    expect(resposta.status).toBe(401);
    expect(resposta.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('expirado alem da janela NAO renova', async () => {
    const { token } = await registerAndLogin();

    // 31 dias: um dia alem da janela de 30. Sem esta checagem, um token vazado ha um ano
    // continuaria renovando para sempre — porque o refresh nunca recusa por idade.
    const velho = tokenExpiradoHa(idDe(token), 31 * 24 * 60 * 60);

    const resposta = await request(app).post('/api/v1/auth/refresh').set(bearer(velho));

    expect(resposta.status).toBe(401);
    expect(resposta.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('token revogado nao renova, mesmo dentro da janela', async () => {
    const { user, token } = await registerAndLogin();

    await request(app).post('/api/v1/auth/logout').set(bearer(token)).expect(204);

    // Sair tem de encerrar de verdade: se a janela reabrisse a sessao, o logout seria
    // decorativo.
    const resposta = await request(app).post('/api/v1/auth/refresh').set(bearer(token));

    expect(resposta.status).toBe(401);
  });

  it('o cookie dura a SESSAO, nao o token', async () => {
    const { user } = await registerAndLogin();

    const resposta = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });

    const cookie = cookieDe(resposta);

    // 30 dias. Se o cookie morresse junto com o token (1h), o navegador o descartaria e
    // nao sobraria nada para renovar — o token ate poderia ser renovado, mas nao haveria
    // token nenhum para apresentar.
    expect(cookie).toMatch(/Max-Age=2592000/);
  });
});
