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

const config = require('../config');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');
const {
  COOKIE_NAME,
  verifyToken,
  verifyTokenIgnoringExpiry,
  isRevoked,
} = require('../utils/tokens');

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

//
// `tolerarExpiracao` existe para UMA rota — o refresh. Em todo o resto, token expirado e
// sessao encerrada. No refresh, expirado ha pouco e exatamente o caso a atender.
async function autenticar(req, opcoes) {
  const tolerarExpiracao = Boolean(opcoes && opcoes.tolerarExpiracao);
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthenticated('Autenticacao necessaria.', ErrorCode.UNAUTHENTICATED);
  }

  let decoded;
  try {
    decoded = tolerarExpiracao ? verifyTokenIgnoringExpiry(token) : verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthenticated(
        'Sessao expirada. Faca login novamente.',
        ErrorCode.TOKEN_EXPIRED
      );
    }
    throw ApiError.unauthenticated('Token invalido.', ErrorCode.TOKEN_INVALID);
  }

  // Tolerada a expiracao, quem decide se a sessao ainda vale e a JANELA — nao a data do
  // token. Sem esta checagem, um token vazado ha um ano continuaria renovando para sempre,
  // porque o refresh nunca recusa por idade.
  if (tolerarExpiracao && decoded.exp) {
    const agora = Math.floor(Date.now() / 1000);

    if (agora - decoded.exp > config.sessionMaxAgeSeconds) {
      throw ApiError.unauthenticated(
        'Sessao expirada. Faca login novamente.',
        ErrorCode.TOKEN_EXPIRED
      );
    }
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

  // Troca de senha derruba tudo que veio antes dela. Sem isto, mudar a senha nao expulsaria
  // ninguem — que e exatamente o motivo pelo qual se troca uma senha.
  //
  // Compara em SEGUNDOS porque o `iat` do JWT so tem precisao de segundo: o token emitido
  // no mesmo segundo da troca e tratado como novo. Isso abre uma janela de 1s — o minimo
  // que da para abrir sem recusar o proprio token que a troca acabou de emitir.
  if (user.passwordChangedAt) {
    const trocadaEm = Math.floor(user.passwordChangedAt.getTime() / 1000);

    if (decoded.iat && decoded.iat < trocadaEm) {
      throw ApiError.unauthenticated(
        'Sua senha foi alterada. Entre novamente.',
        ErrorCode.TOKEN_INVALID
      );
    }
  }

  req.user = user;
  req.userId = String(user._id);
  // Guardado para logout e refresh revogarem exatamente este token.
  req.token = { raw: token, decoded };
}

const requireAuth = asyncHandler(async (req, res, next) => {
  await autenticar(req);
  next();
});

/**
 * Igual ao requireAuth, mas aceita token expirado dentro da janela de sessao.
 *
 * SO o refresh usa: e o unico lugar onde "expirado" nao significa "encerrado". Em
 * qualquer outra rota, expirado e expirado.
 */
const requireRenewableAuth = asyncHandler(async (req, res, next) => {
  await autenticar(req, { tolerarExpiracao: true });
  next();
});

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRenewableAuth = requireRenewableAuth;
module.exports.extractToken = extractToken;
