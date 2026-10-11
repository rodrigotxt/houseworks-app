// middlewares/auth.js
// Autenticacao: prova QUEM e o usuario. Nao decide o que ele pode fazer — isso e
// responsabilidade dos middlewares de membership/capacidade.
//
// O token carrega apenas a identidade (claim "sub") e um identificador proprio ("jti").
// Casa e papel NAO entram no token porque um usuario pode pertencer a mais de uma casa:
// o papel e resolvido por requisicao contra a Membership. Efeito colateral desejado:
// mudanca de papel vale imediatamente, sem esperar o token expirar.
//
// Tres formas de apresentar o token, nesta ordem de precedencia:
//   1. Authorization: Bearer <jwt>   — clientes nao-browser (mobile, CLI, scripts)
//   2. cookie httpOnly jwt_token     — browser (imune a XSS)
//   3. header x-auth-token           — legado, mantido por compatibilidade

const User = require('../models/User');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');
const { COOKIE_NAME, verifyToken, isRevoked } = require('../utils/tokens');

function extractToken(req) {
  const authorization = req.get('Authorization');

  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  const cookie = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (cookie) {
    return cookie;
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
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthenticated(
        'Sessao expirada. Faca login novamente.',
        ErrorCode.TOKEN_EXPIRED
      );
    }
    throw ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID);
  }

  // Logout e refresh revogam o token pelo jti. Sem esta checagem, sair nao teria efeito
  // nenhum para quem ja tivesse copiado o token.
  if (await isRevoked(decoded.jti)) {
    throw ApiError.unauthenticated(
      'Sessao encerrada. Faca login novamente.',
      ErrorCode.TOKEN_INVALID
    );
  }

  const user = await User.findById(decoded.sub);

  // Usuario removido depois da emissao do token: o token deixa de valer.
  if (!user) {
    throw ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID);
  }

  req.user = user;
  req.userId = String(user._id);
  // Guardado para logout e refresh revogarem exatamente este token.
  req.token = { raw: token, decoded };

  return next();
}

module.exports = asyncHandler(requireAuth);
module.exports.requireAuth = asyncHandler(requireAuth);
module.exports.extractToken = extractToken;
