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
    maxAge: config.tokenTtlSeconds * 1000,
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
  revoke,
  isRevoked,
  cookieOptions,
  setAuthCookie,
  clearAuthCookie,
};
