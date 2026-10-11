// tests/helpers/auth.js
// Atalhos para montar o cenario de teste: usuario com token, casa e membros.

const request = require('supertest');
const app = require('../../app');

let counter = 0;

function nextUser(overrides) {
  counter += 1;

  return Object.assign(
    {
      name: 'Usuario de Teste ' + counter,
      username: 'usuario' + counter,
      email: 'usuario' + counter + '@example.com',
      password: 'senha12345',
    },
    overrides || {}
  );
}

function bearer(token) {
  return { Authorization: 'Bearer ' + token };
}

// Registra e autentica um usuario. Sem householdName, o usuario nasce sem casa.
async function registerAndLogin(overrides) {
  const user = nextUser(overrides);

  const registerResponse = await request(app).post('/api/v1/auth/register').send(user);

  if (registerResponse.status !== 201) {
    throw new Error('Falha ao registrar usuario de teste: ' + JSON.stringify(registerResponse.body));
  }

  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });

  if (loginResponse.status !== 200) {
    throw new Error('Falha ao autenticar usuario de teste: ' + JSON.stringify(loginResponse.body));
  }

  return { user, token: loginResponse.body.data.token };
}

// Registra, autentica e ja cria a casa — o usuario vira owner.
async function createOwner(householdOverrides) {
  const account = await registerAndLogin();

  const response = await request(app)
    .post('/api/v1/households')
    .set(bearer(account.token))
    .send(Object.assign({ name: 'Casa de Teste' }, householdOverrides || {}));

  if (response.status !== 201) {
    throw new Error('Falha ao criar casa de teste: ' + JSON.stringify(response.body));
  }

  return { user: account.user, token: account.token, household: response.body.data };
}

async function getInviteCode(token, householdId) {
  const response = await request(app)
    .get('/api/v1/households/' + householdId + '/invite')
    .set(bearer(token));

  if (response.status !== 200) {
    throw new Error('Falha ao ler o convite: ' + JSON.stringify(response.body));
  }

  return response.body.data.code;
}

// Cria um usuario novo e o coloca na casa informada, pelo fluxo real de convite.
async function addMember(ownerToken, householdId, role) {
  const account = await registerAndLogin();
  const code = await getInviteCode(ownerToken, householdId);

  const response = await request(app)
    .post('/api/v1/households/join')
    .set(bearer(account.token))
    .send({ inviteCode: code, role });

  if (response.status !== 201) {
    throw new Error('Falha ao entrar na casa: ' + JSON.stringify(response.body));
  }

  return { user: account.user, token: account.token, membership: response.body.data };
}

module.exports = {
  app,
  request,
  bearer,
  registerAndLogin,
  createOwner,
  getInviteCode,
  addMember,
};
