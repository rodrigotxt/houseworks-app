// utils/tokens.js
// Emissao, verificacao e cookie do JWT. Um so lugar decide o formato do token, para o
// login, o refresh e o middleware nao divergirem.

const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const config = require('../config');
const RevokedToken = require('../models/RevokedToken');

// Mesmo nome lido pelo middleware do Next.js (frontend/middleware.ts) e
// declarado no contrato como cookieAuth.
const COOKIE_NAME = 'jwt_token';

// O token carrega apenas a identidade (sub) e um identificador proprio (jti).
// Casa e papel sao resolvidos por requisicao contra a Membership — um usuario pode
// pertencer a varias casas, e mudanca de papel vale na hora.
function signToken(user) {
  const jti = randomUUID();

  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.tokenTtlSeconds,
    jwtid: jti,
  });

  return { token, jti };
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

// Verifica a ASSINATURA ignorando a expiracao.
//
// Existe por causa do refresh, e so por causa dele: o token que chega la pode estar
// expirado ha minutos, e esse e exatamente o caso que precisa ser atendido — sem isso,
// renovar exigiria um token valido, o que torna a renovacao impossivel na pratica.
//
// NAO usar sozinha para autorizar nada: quem decide se a sessao ainda vale e a janela
// de tempo, conferida por quem chama (middlewares/auth.js).
function verifyTokenIgnoringExpiry(token) {
  return jwt.verify(token, config.jwtSecret, { ignoreExpiration: true });
}

// Revoga um token pelo seu jti, ate o instante em que ele expiraria sozinho.
async function revoke(decoded, reason) {
  if (!decoded || !decoded.jti) {
    return false;
  }

  const expiresAt = decoded.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + config.tokenTtlSeconds * 1000);

  try {
    await RevokedToken.create({ jti: decoded.jti, expiresAt, reason: reason || 'logout' });
  } catch (error) {
    // 11000 = ja revogado. Revogar duas vezes nao e erro.
    if (error.code !== 11000) {
      throw error;
    }
  }

  return true;
}

async function isRevoked(jti) {
  if (!jti) {
    return false;
  }

  const encontrado = await RevokedToken.exists({ jti });
  return Boolean(encontrado);
}

function cookieOptions() {
  return {
    httpOnly: true,
    // Em producao o cookie so trafega por HTTPS.
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    // O cookie dura a SESSAO, nao o token. E ele que carrega o token de uma visita a
    // outra: expirado o token, o refresh troca por outro enquanto o cookie ainda estiver
    // aqui. Amarrar o cookie ao token (1h) era o que fazia a sessao morrer de vez — o
    // navegador descartava o cookie e nao sobrava nada para renovar.
    maxAge: config.sessionMaxAgeSeconds * 1000,
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  verifyTokenIgnoringExpiry,
  revoke,
  isRevoked,
  cookieOptions,
  setAuthCookie,
  clearAuthCookie,
};
