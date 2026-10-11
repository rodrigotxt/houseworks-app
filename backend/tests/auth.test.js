// tests/auth.test.js
// Fase 0 — validacao com zod, catalogo de erros e envelope nas rotas de autenticacao.

const request = require('supertest');
const app = require('../app');

const validUser = {
  name: 'Isabella Soares',
  username: 'isabella',
  email: 'isabella@example.com',
  password: 'senha12345',
};

describe('POST /api/v1/auth/register', () => {
  it('registro valido -> 201 com envelope e sem hash de senha', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(validUser);

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      username: 'isabella',
      email: 'isabella@example.com',
    });
    expect(response.body.data.user.id).toBeDefined();
    expect(response.body.data.user.password).toBeUndefined();
  });

  it('normaliza o email para minusculas', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'Isabella@Example.COM' });

    expect(response.body.data.user.email).toBe('isabella@example.com');
  });

  it('senha curta -> 400 VALIDATION_ERROR com details por campo', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, password: 'abc' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })])
    );
  });

  it('email invalido -> 400 apontando o campo email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'nao-e-email' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  it('campo fora do contrato -> 400 (mass-assignment bloqueado)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, role: 'owner' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('email duplicado -> 409 EMAIL_ALREADY_REGISTERED', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser).expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, username: 'outro' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('username duplicado -> 409 USERNAME_ALREADY_REGISTERED', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser).expect(201);

    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'outro@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('USERNAME_ALREADY_REGISTERED');
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(validUser).expect(201);
  });

  it('credenciais validas -> 200 com token, expiresIn e usuario', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.expiresIn).toBe(3600);
    expect(response.body.data.user.password).toBeUndefined();
  });

  it('aceita username como identificador', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: validUser.username, password: validUser.password });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.token).toBe('string');
  });

  it('senha errada -> 401 INVALID_CREDENTIALS', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'senha-errada' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('usuario inexistente -> 401 INVALID_CREDENTIALS (nao revela qual falhou)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ninguem@example.com', password: 'senha12345' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('sem email e sem username -> 400 VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'senha12345' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
