// tests/helpers/auth.js
// Atalho para criar um usuario e obter um token valido.

const request = require('supertest');
const app = require('../../app');

let counter = 0;

async function registerAndLogin(overrides) {
  counter += 1;

  const user = Object.assign(
    {
      name: 'Usuario de Teste',
      username: 'usuario' + counter,
      email: 'usuario' + counter + '@example.com',
      password: 'senha12345',
    },
    overrides || {}
  );

  const registerResponse = await request(app)
    .post('/api/v1/auth/register')
    .send(user);

  if (registerResponse.status !== 201) {
    throw new Error(
      'Falha ao registrar usuario de teste: ' + JSON.stringify(registerResponse.body)
    );
  }

  const loginResponse = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });

  if (loginResponse.status !== 200) {
    throw new Error('Falha ao autenticar usuario de teste: ' + JSON.stringify(loginResponse.body));
  }

  return { user, token: loginResponse.body.data.token };
}

module.exports = { registerAndLogin };
