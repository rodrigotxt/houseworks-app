// tests/setup.js
// Executado ANTES de cada arquivo de teste ser importado.
// As variaveis de ambiente precisam estar definidas em escopo de modulo: config/index.js
// le process.env.JWT_SECRET no momento do require, e o arquivo de teste faz require('../app')
// no topo — antes de qualquer hook rodar.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-nao-usar-em-producao';

// A suite inteira faz centenas de login/registro; sem desligar o limite, os testes
// esbarrariam no 429. O arquivo que testa o proprio limite o religa antes de importar
// o app (tests/hardening.test.js).
process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED || 'false';

// Chaves VAPID efemeras para a suite. Sem elas o canal push fica indisponivel e nao
// haveria como testar inscricao nem a recusa de um lembrete com push.
if (!process.env.VAPID_PUBLIC_KEY) {
  const webpush = require('web-push');
  const keys = webpush.generateVAPIDKeys();

  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
}

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
