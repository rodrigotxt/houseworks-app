// tests/authorization.test.js
// Fase 1 — o isolamento entre casas e o que separa requireMember de requireRole.
// Este arquivo e a prova do P2 do roadmap (antes nao existia nada disso).

const { app, request, bearer, registerAndLogin, createOwner, addMember } = require('./helpers/auth');

describe('isolamento entre casas', () => {
  it('quem nao e membro recebe 403 NOT_HOUSEHOLD_MEMBER em todas as rotas da casa', async () => {
    const owner = await createOwner();
    const estranho = await registerAndLogin();

    const rotas = [
      ['get', '/api/v1/households/' + owner.household.id],
      ['get', '/api/v1/households/' + owner.household.id + '/members'],
      ['get', '/api/v1/households/' + owner.household.id + '/invite'],
      ['patch', '/api/v1/households/' + owner.household.id],
      ['delete', '/api/v1/households/' + owner.household.id],
    ];

    for (const [metodo, rota] of rotas) {
      const response = await request(app)[metodo](rota).set(bearer(estranho.token));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
    }
  });

  it('membro de outra casa nao acessa os membros desta', async () => {
    const ownerA = await createOwner({ name: 'Casa A' });
    const ownerB = await createOwner({ name: 'Casa B' });

    const response = await request(app)
      .get('/api/v1/households/' + ownerA.household.id + '/members')
      .set(bearer(ownerB.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });

  it('sem token -> 401 UNAUTHENTICATED', async () => {
    const owner = await createOwner();

    const response = await request(app).get('/api/v1/households/' + owner.household.id);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('sem token na listagem de casas -> 401', async () => {
    const response = await request(app).get('/api/v1/households');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('requireMember x requireRole', () => {
  it('child passa pelo requireMember mas nao pelo requireRole de owner', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    // Passa: e membro.
    const leitura = await request(app)
      .get('/api/v1/households/' + owner.household.id)
      .set(bearer(child.token));
    expect(leitura.status).toBe(200);

    // Nao passa: nao e owner.
    const escrita = await request(app)
      .patch('/api/v1/households/' + owner.household.id)
      .set(bearer(child.token))
      .send({ name: 'Nao deveria' });
    expect(escrita.status).toBe(403);
    expect(escrita.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('adult administra tarefas mas nao membros', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');
    const outro = await addMember(owner.token, owner.household.id, 'child');

    const gerenciarMembro = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + outro.membership.user.id)
      .set(bearer(adult.token))
      .send({ role: 'adult' });

    expect(gerenciarMembro.status).toBe(403);
    expect(gerenciarMembro.body.error.code).toBe('INSUFFICIENT_ROLE');
  });
});

describe('GET /auth/me', () => {
  it('devolve o usuario e suas memberships com casa e papel', async () => {
    const owner = await createOwner({ name: 'Casa dos Martins' });
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app).get('/api/v1/auth/me').set(bearer(child.token));

    expect(response.status).toBe(200);
    expect(response.body.data.user.username).toBe(child.user.username);
    expect(response.body.data.user.password).toBeUndefined();
    expect(response.body.data.memberships).toHaveLength(1);
    expect(response.body.data.memberships[0]).toMatchObject({
      role: 'child',
      householdId: owner.household.id,
    });
  });

  it('sem token -> 401', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });
});

describe('cadastro ja criando a casa', () => {
  it('register com householdName cria a casa e o owner', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Rodrigo Martins',
      username: 'rodrigo',
      email: 'rodrigo@example.com',
      password: 'senha12345',
      householdName: 'Casa dos Martins',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.password).toBeUndefined();
    expect(response.body.data.household.name).toBe('Casa dos Martins');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rodrigo@example.com', password: 'senha12345' });

    const me = await request(app).get('/api/v1/auth/me').set(bearer(login.body.data.token));

    expect(me.body.data.memberships[0].role).toBe('owner');
    expect(me.body.data.memberships[0].householdId).toBe(response.body.data.household.id);
  });

  it('register sem householdName nao cria casa', async () => {
    const { user, token } = await registerAndLogin();

    const response = await request(app).get('/api/v1/auth/me').set(bearer(token));

    expect(response.body.data.user.username).toBe(user.username);
    expect(response.body.data.memberships).toEqual([]);
  });
});
