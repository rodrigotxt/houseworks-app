// middlewares/auth.js
// Autenticacao: prova QUEM e o usuario. Nao decide o que ele pode fazer — isso e
// responsabilidade dos middlewares de membership/capacidade.
//
// O token carrega apenas a identidade (claim "sub"). Casa e papel NAO entram no token
// porque um usuario pode pertencer a mais de uma casa: o papel e resolvido por
// requisicao contra a Membership. Efeito colateral desejado: mudanca de papel vale
// imediatamente, sem esperar o token expirar.

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');

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

async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthenticated('Autenticacao necessaria.', ErrorCode.UNAUTHENTICATED);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthenticated(
        'Sessao expirada. Faca login novamente.',
        ErrorCode.TOKEN_EXPIRED
      );
    }
    throw ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID);
  }

  const user = await User.findById(decoded.sub);

  // Usuario removido depois da emissao do token: o token deixa de valer.
  if (!user) {
    throw ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID);
  }

  req.user = user;
  req.userId = String(user._id);

  return next();
}

module.exports = asyncHandler(requireAuth);
module.exports.requireAuth = asyncHandler(requireAuth);
module.exports.extractToken = extractToken;
