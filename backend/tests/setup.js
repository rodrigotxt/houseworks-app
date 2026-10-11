// tests/setup.js
// Executado ANTES de cada arquivo de teste ser importado.
// As variaveis de ambiente precisam estar definidas em escopo de modulo: config/index.js
// le process.env.JWT_SECRET no momento do require, e o arquivo de teste faz require('../app')
// no topo — antes de qualquer hook rodar.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-nao-usar-em-producao';

const db = require('./helpers/db');

beforeAll(async () => {
  await db.connect();
});

afterEach(async () => {
  await db.clear();
});

afterAll(async () => {
  await db.disconnect();
});
