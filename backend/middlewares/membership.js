// middlewares/membership.js
// Autorizacao em duas etapas, sempre nesta ordem:
//
//   1. requireMember  — a casa existe e o usuario e membro dela?
//   2. authorize(...) ou requireRole(...) — o papel permite esta acao?
//
// Substitui as checagens de posse copiadas em cada controller (P6 do roadmap).
// Deixa req.household e req.membership prontos para o handler.

const Household = require('../models/Household');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');
const { resolveCapabilities } = require('../utils/capabilities');

// Carrega a casa e a membership do usuario autenticado.
async function loadMembership(req, res, next) {
  const household = await Household.findById(req.params.householdId);

  if (!household) {
    throw ApiError.notFound('Casa nao encontrada.', ErrorCode.HOUSEHOLD_NOT_FOUND);
  }

  const membership = await Membership.findOne({
    household: household._id,
    user: req.userId,
  });

  if (!membership) {
    // Nao revelamos nada sobre a casa para quem nao e membro.
    throw ApiError.forbidden(
      'Voce nao tem acesso a esta casa.',
      ErrorCode.NOT_HOUSEHOLD_MEMBER
    );
  }

  req.household = household;
  req.membership = membership;

  return next();
}

// Exige uma capacidade efetiva (papel + sobreposicoes).
function authorize(capability) {
  return function authorizeMiddleware(req, res, next) {
    const capabilities = resolveCapabilities(req.membership.role, req.membership.overrides);

    if (!capabilities[capability]) {
      return next(
        ApiError.forbidden(
          'Seu papel nesta casa nao permite esta acao.',
          ErrorCode.INSUFFICIENT_ROLE
        )
      );
    }

    return next();
  };
}

// Exige um papel especifico. Usado onde o contrato nomeia o papel em vez da capacidade.
function requireRole() {
  const allowed = Array.prototype.slice.call(arguments);

  return function requireRoleMiddleware(req, res, next) {
    if (allowed.indexOf(req.membership.role) === -1) {
      return next(
        ApiError.forbidden(
          'Seu papel nesta casa nao permite esta acao.',
          ErrorCode.INSUFFICIENT_ROLE
        )
      );
    }

    return next();
  };
}

module.exports = {
  requireMember: asyncHandler(loadMembership),
  authorize,
  requireRole,
};
