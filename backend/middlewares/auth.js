// middlewares/auth.js
// Aceita o token por Authorization: Bearer (clientes nao-browser) ou pelo header
// legado x-auth-token. O cookie httpOnly jwt_token entra na Fase 1 (ROADMAP C4).
// Erros saem pelo catalogo: UNAUTHENTICATED, TOKEN_EXPIRED ou TOKEN_INVALID.

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');

function extractToken(req) {
  const authorization = req.get('Authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  const legacy = req.get('x-auth-token');
  if (legacy) {
    return legacy.startsWith('Bearer ') ? legacy.slice(7).trim() : legacy.trim();
  }

  return null;
}

module.exports = function auth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return next(ApiError.unauthenticated('Autenticacao necessaria.', ErrorCode.UNAUTHENTICATED));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded.user;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(
        ApiError.unauthenticated(
          'Sessao expirada. Faca login novamente.',
          ErrorCode.TOKEN_EXPIRED
        )
      );
    }

    return next(ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID));
  }
};
