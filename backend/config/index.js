// config/index.js
require('dotenv').config(); // Garante que as variáveis de ambiente sejam carregadas

// Falhar aqui, na subida, e muito melhor do que falhar no primeiro login com
// "secretOrPrivateKey must have a value" — que foi exatamente o que aconteceu antes
// desta checagem existir.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET nao definido. Copie .env.example para .env e gere um segredo proprio.'
  );
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoURI: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  // Validade do token em segundos. Curta de proposito: o refresh existe para renovar.
  tokenTtlSeconds: Number(process.env.JWT_EXPIRES_IN) || 3600,
  // Quanto tempo a SESSAO dura, em segundos. Sao duas coisas de uma vez:
  //   - o prazo do COOKIE, que carrega o token de uma visita a outra;
  //   - a janela em que um token JA EXPIRADO ainda pode ser renovado.
  // O token continua curto; o que dura e a sessao. Ver utils/tokens.js.
  sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE) || 30 * 24 * 60 * 60,
  // Origens permitidas no CORS, separadas por virgula. Sem isto, so desenvolvimento.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
  // Ligado por padrao; so os testes desligam, para nao esbarrar no limite.
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 10,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
};