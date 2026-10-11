// app.js
// Monta o aplicativo Express. NAO conecta ao banco nem escuta porta — isso e papel do
// server.js. Essa separacao e o que permite os testes usarem o app com um Mongo em memoria.

const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const requestId = require('./middlewares/requestId');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Lista de origens permitidas
const allowedOrigins = [
  'http://localhost:3000',
  'http://backend:3000',
  'http://localhost',
];

// Configuracoes do CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisicoes sem origem (clientes mobile, curl) OU origem na lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Nao permitido por CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  // Sem isso o browser nao consegue ler o header de correlacao.
  exposedHeaders: ['X-Request-Id'],
  optionsSuccessStatus: 204,
};

app.disable('x-powered-by');

// Ordem importa: o requestId precisa existir antes de qualquer erro ser produzido.
app.use(requestId);
app.use(cors(corsOptions));
app.use(express.json());

// Contrato versionado.
app.use('/api/v1', routes);

// Alias de compatibilidade: o frontend atual ainda chama /api/*.
// Mantido ate a Fase 5 (ver docs/ROADMAP.md, item C4).
app.use('/api', routes);

// 404 e erro passam pelos middlewares centrais: nenhum corpo de erro nasce fora deles.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
