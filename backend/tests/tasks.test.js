// tests/tasks.test.js
// Fase 0 — middleware de auth pelo catalogo, envelope nas tarefas e allow-list de campos.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const config = require('../config');
const { registerAndLogin } = require('./helpers/auth');

const validTask = { name: 'Limpar banheiro', frequency: 'semanal', difficulty: 'dificil' };

describe('autenticacao das rotas privadas', () => {
  it('sem token -> 401 UNAUTHENTICATED', async () => {
    const response = await request(app).get('/api/v1/tasks');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('token invalido -> 401 TOKEN_INVALID', async () => {
    const response = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer nao-e-um-jwt');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('token expirado -> 401 TOKEN_EXPIRED', async () => {
    const expired = jwt.sign(
      { user: { id: '000000000000000000000000' } },
      config.jwtSecret,
      { expiresIn: -10 }
    );

    const response = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + expired);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('aceita Authorization: Bearer', async () => {
    const { token } = await registerAndLogin();

    await request(app).get('/api/v1/tasks').set('Authorization', 'Bearer ' + token).expect(200);
  });

  it('mantem o header legado x-auth-token', async () => {
    const { token } = await registerAndLogin();

    await request(app).get('/api/v1/tasks').set('x-auth-token', token).expect(200);
  });
});

describe('tarefas', () => {
  it('cria tarefa -> 201 no envelope { data }', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + token)
      .send(validTask);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject(validTask);
    expect(response.body.data.id).toBeDefined();
  });

  it('rejeita campo fora do contrato na criacao (status)', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + token)
      .send({ ...validTask, status: 'concluida' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita frequencia fora do enum', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + token)
      .send({ ...validTask, frequency: 'a_cada_lua_cheia' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'frequency' })])
    );
  });

  it('lista apenas as tarefas do proprio usuario', async () => {
    const { token: tokenA } = await registerAndLogin();
    const { token: tokenB } = await registerAndLogin();

    await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + tokenA)
      .send(validTask)
      .expect(201);

    const listaB = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + tokenB);

    expect(listaB.body.data).toEqual([]);
  });

  it('nao acessa tarefa de outro usuario -> 403 FORBIDDEN', async () => {
    const { token: tokenA } = await registerAndLogin();
    const { token: tokenB } = await registerAndLogin();

    const criada = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + tokenA)
      .send(validTask);

    const response = await request(app)
      .get('/api/v1/tasks/' + criada.body.data.id)
      .set('Authorization', 'Bearer ' + tokenB);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('id malformado -> 400 VALIDATION_ERROR (CastError tratado)', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/v1/tasks/nao-e-um-object-id')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('tarefa inexistente -> 404 TASK_NOT_FOUND', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/v1/tasks/000000000000000000000000')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('DELETE -> 204 sem corpo', async () => {
    const { token } = await registerAndLogin();

    const criada = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + token)
      .send(validTask);

    const response = await request(app)
      .delete('/api/v1/tasks/' + criada.body.data.id)
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('PUT sem nenhum campo -> 400', async () => {
    const { token } = await registerAndLogin();

    const criada = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', 'Bearer ' + token)
      .send(validTask);

    const response = await request(app)
      .put('/api/v1/tasks/' + criada.body.data.id)
      .set('Authorization', 'Bearer ' + token)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
