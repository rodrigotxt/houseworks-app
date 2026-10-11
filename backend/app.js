// app.js
// Monta o aplicativo Express. NAO conecta ao banco nem escuta porta — isso e papel do
// server.js. Essa separacao e o que permite os testes usarem o app com um Mongo em memoria.

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const config = require('./config');
const routes = require('./routes');
const requestId = require('./middlewares/requestId');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// Origens de desenvolvimento. Em producao, ALLOWED_ORIGINS precisa ser definido —
// sem isso o navegador nao consegue falar com a API a partir do dominio real.
const DEV_ORIGINS = ['http://localhost:3000', 'http://backend:3000', 'http://localhost'];

const allowedOrigins = config.allowedOrigins.length ? config.allowedOrigins : DEV_ORIGINS;

if (config.nodeEnv === 'production' && config.allowedOrigins.length === 0) {
  console.warn(
    '[cors] ALLOWED_ORIGINS nao definido em producao — valendo apenas as origens de desenvolvimento.'
  );
}

// Configuracoes do CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Sem origem: cliente nao-browser (mobile, curl, healthcheck).
    if (!origin) {
      return callback(null, true);
    }

    // Origem fora da lista nao vira erro 500: simplesmente nao recebe os cabecalhos de
    // CORS, e o navegador bloqueia. Um 500 aqui so poluiria o log e esconderia a causa
    // real de quem esta depurando.
    return callback(null, allowedOrigins.indexOf(origin) !== -1);
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

// A API nao serve HTML, entao a CSP (que existe para paginas) nao se aplica; e o
// crossOriginResourcePolicy precisa permitir que o front, em outra origem, leia a resposta.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(cors(corsOptions));
// O browser manda o JWT no cookie httpOnly jwt_token; os clientes nao-browser mandam
// no header Authorization.
app.use(cookieParser());
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
