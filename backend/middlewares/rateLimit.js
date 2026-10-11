// middlewares/rateLimit.js
// Limite de tentativas nas rotas de credencial.
//
// Sem isto, /auth/login e um oraculo de senhas: da para testar milhares por minuto.
// O limite e por IP e vale so para essas rotas — o resto da API nao tem motivo para ser
// limitado, e limitar tudo atrapalharia o uso normal do app.
//
// Desligavel por RATE_LIMIT_ENABLED=false. A suite de testes desliga por padrao (faz
// centenas de logins); o arquivo que testa o proprio limite o religa.

const rateLimit = require('express-rate-limit');

const config = require('../config');
const ApiError = require('../utils/apiError');

const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.rateLimitEnabled,
  // A resposta sai pelo envelope de erro como qualquer outra: mesmo catalogo, mesmo
  // requestId. Um 429 com corpo proprio seria mais um formato para o front tratar.
  handler: function (req, res, next) {
    next(ApiError.tooManyRequests());
  },
});

module.exports = { authLimiter };
