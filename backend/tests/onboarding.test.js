// tests/onboarding.test.js
// Como uma pessoa ENTRA numa casa — os dois caminhos, e o que cada um exige.
//
// Caminho A: cadastro publico (POST /auth/register sem householdName) + codigo de convite.
// Caminho B: alguem que ja esta na casa cadastra a pessoa (owner only).
//
// A troca de senha entra aqui porque e ela que fecha o caminho B: enquanto a pessoa nao
// troca a senha que o dono escolheu, o dono conhece a senha dela — e num app em que um
// membro avalia o trabalho do outro, isso esvaziaria a avaliacao.

const request = require('supertest');
const app = require('../app');
const { bearer, registerAndLogin, createOwner, getInviteCode } = require('./helpers/auth');

function membroCriado(overrides) {
  const n = Math.random().toString(36).slice(2, 8);
  return Object.assign(
    {
      name: 'Pessoa Nova',
      username: 'pessoa' + n,
      email: 'pessoa' + n + '@example.com',
      password: 'senha12345',
    },
    overrides || {}
  );
}

describe('caminho A — cadastro publico + codigo de convite', () => {
  it('cadastro sem householdName cria usuario SEM casa', async () => {
    const { token } = await registerAndLogin();

    const resposta = await request(app).get('/api/v1/auth/me').set(bearer(token));

    expect(resposta.status).toBe(200);
    expect(resposta.body.data.memberships).toEqual([]);
  });

  it('com o codigo, a pessoa passa a ver a casa', async () => {
    const dono = await createOwner();
    const codigo = await getInviteCode(dono.token, dono.household.id);

    const pessoa = await registerAndLogin();

    const entrada = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(pessoa.token))
      .send({ inviteCode: codigo, role: 'adult' });

    expect(entrada.status).toBe(201);
    expect(entrada.body.data.role).toBe('adult');
    expect(entrada.body.data.householdId).toBe(dono.household.id);

    const eu = await request(app).get('/api/v1/auth/me').set(bearer(pessoa.token));
    expect(eu.body.data.memberships).toHaveLength(1);
  });

  it('codigo invalido responde 403 INVITE_CODE_INVALID', async () => {
    const pessoa = await registerAndLogin();

    const resposta = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(pessoa.token))
      .send({ inviteCode: 'NAOEXISTE' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error.code).toBe('INVITE_CODE_INVALID');
  });

  it('entrar duas vezes na mesma casa responde 409 DUPLICATE_MEMBER', async () => {
    const dono = await createOwner();
    const codigo = await getInviteCode(dono.token, dono.household.id);
    const pessoa = await registerAndLogin();

    await request(app)
      .post('/api/v1/households/join')
      .set(bearer(pessoa.token))
      .send({ inviteCode: codigo })
      .expect(201);

    const denovo = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(pessoa.token))
      .send({ inviteCode: codigo });

    expect(denovo.status).toBe(409);
    expect(denovo.body.error.code).toBe('DUPLICATE_MEMBER');
  });
});

describe('caminho B — o dono cadastra a pessoa', () => {
  it('owner cadastra e a pessoa ja nasce membro', async () => {
    const dono = await createOwner();
    const nova = membroCriado();

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(nova);

    expect(resposta.status).toBe(201);
    expect(resposta.body.data.user.username).toBe(nova.username);
    expect(resposta.body.data.householdId).toBe(dono.household.id);

    // E consegue entrar com a senha que o dono escolheu.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: nova.email, password: nova.password });

    expect(login.status).toBe(200);
  });

  it('sem papel informado, entra como child', async () => {
    const dono = await createOwner();

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(membroCriado());

    expect(resposta.status).toBe(201);
    expect(resposta.body.data.role).toBe('child');
  });

  it('a pessoa cadastrada aparece na lista de membros', async () => {
    const dono = await createOwner();
    const nova = membroCriado();

    await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(nova)
      .expect(201);

    const lista = await request(app)
      .get('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token));

    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(2);
    expect(lista.body.data.map((m) => m.user.username)).toContain(nova.username);
  });

  it('quem nao e owner recebe 403 INSUFFICIENT_ROLE', async () => {
    const dono = await createOwner();
    const codigo = await getInviteCode(dono.token, dono.household.id);
    const adulto = await registerAndLogin();

    await request(app)
      .post('/api/v1/households/join')
      .set(bearer(adulto.token))
      .send({ inviteCode: codigo, role: 'adult' })
      .expect(201);

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(adulto.token))
      .send(membroCriado());

    expect(resposta.status).toBe(403);
    expect(resposta.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('email ja registrado responde 409 EMAIL_ALREADY_REGISTERED', async () => {
    const dono = await createOwner();
    const existente = await registerAndLogin();

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(membroCriado({ email: existente.user.email }));

    expect(resposta.status).toBe(409);
    expect(resposta.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('nome de usuario ja registrado responde 409 USERNAME_ALREADY_REGISTERED', async () => {
    const dono = await createOwner();
    const existente = await registerAndLogin();

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(membroCriado({ username: existente.user.username }));

    expect(resposta.status).toBe(409);
    expect(resposta.body.error.code).toBe('USERNAME_ALREADY_REGISTERED');
  });

  it('senha curta responde 400 VALIDATION_ERROR', async () => {
    const dono = await createOwner();

    const resposta = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(membroCriado({ password: 'curta' }));

    expect(resposta.status).toBe(400);
    expect(resposta.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('nao cria casa: a pessoa entra so na casa de quem cadastrou', async () => {
    const dono = await createOwner();
    const nova = membroCriado();

    const criada = await request(app)
      .post('/api/v1/households/' + dono.household.id + '/members')
      .set(bearer(dono.token))
      .send(nova)
      .expect(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: nova.email, password: nova.password })
      .expect(200);

    const eu = await request(app).get('/api/v1/auth/me').set(bearer(login.body.data.token));

    expect(eu.body.data.memberships).toHaveLength(1);
    expect(eu.body.data.memberships[0].householdId).toBe(dono.household.id);
    expect(eu.body.data.memberships[0].role).toBe(criada.body.data.role);
  });
});

describe('troca de senha', () => {
  it('com a senha atual correta, troca e emite token novo', async () => {
    const { user, token } = await registerAndLogin();

    const resposta = await request(app)
      .patch('/api/v1/auth/password')
      .set(bearer(token))
      .send({ currentPassword: user.password, newPassword: 'novaSenha123' });

    expect(resposta.status).toBe(200);
    expect(typeof resposta.body.data.token).toBe('string');

    // A senha antiga nao serve mais; a nova, sim.
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'novaSenha123' })
      .expect(200);
  });

  it('senha atual errada responde 401 INVALID_CREDENTIALS', async () => {
    const { token } = await registerAndLogin();

    const resposta = await request(app)
      .patch('/api/v1/auth/password')
      .set(bearer(token))
      .send({ currentPassword: 'nao-e-essa', newPassword: 'novaSenha123' });

    expect(resposta.status).toBe(401);
    expect(resposta.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('DERUUBA as outras sessoes, e mantem a de quem trocou', async () => {
    const { user } = await registerAndLogin();

    // Duas sessoes vivas do mesmo usuario (dois aparelhos).
    const primeira = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const segunda = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(segunda.body.data.token))
      .expect(200);

    // Espera passar o segundo do `iat`: a comparacao e em segundos, entao trocar no mesmo
    // segundo do login seria tratado como sessao nova — e o teste nao provaria nada.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const troca = await request(app)
      .patch('/api/v1/auth/password')
      .set(bearer(primeira.body.data.token))
      .send({ currentPassword: user.password, newPassword: 'novaSenha123' });

    expect(troca.status).toBe(200);

    // A outra sessao morreu...
    const antiga = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(segunda.body.data.token));

    expect(antiga.status).toBe(401);
    expect(antiga.body.error.code).toBe('TOKEN_INVALID');

    // ...e quem trocou continua dentro, pelo token que a troca devolveu.
    await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(troca.body.data.token))
      .expect(200);
  });

  it('nova senha curta responde 400 VALIDATION_ERROR', async () => {
    const { user, token } = await registerAndLogin();

    const resposta = await request(app)
      .patch('/api/v1/auth/password')
      .set(bearer(token))
      .send({ currentPassword: user.password, newPassword: 'curta' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error.code).toBe('VALIDATION_ERROR');
  });
});

