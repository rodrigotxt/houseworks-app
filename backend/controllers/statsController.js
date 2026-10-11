// controllers/statsController.js
// Desempenho. Os controllers so resolvem a janela e delegam — a agregacao inteira
// acontece no Mongo (services/stats.js).

const Household = require('../models/Household');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok } = require('../utils/respond');
const { householdStats, leaderboard, memberScore } = require('../services/stats');

// @desc    Estatisticas da casa
// @route   GET /api/v1/households/:householdId/stats
// @access  Membro da casa
exports.household = async (req, res) => {
  const query = req.validatedQuery;
  const relatorio = await householdStats(req.household, { from: query.from, to: query.to });

  return ok(res, relatorio);
};

// @desc    Ranking da casa
// @route   GET /api/v1/households/:householdId/leaderboard
// @access  Membro da casa
exports.leaderboard = async (req, res) => {
  const query = req.validatedQuery;
  const ranking = await leaderboard(req.household, {
    period: query.period || 'week',
    from: query.from,
    to: query.to,
  });

  return ok(res, ranking);
};

// @desc    Minha pontuacao numa casa
// @route   GET /api/v1/me/score
// @access  Privado
exports.myScore = async (req, res) => {
  const query = req.validatedQuery;

  const membership = await Membership.findOne({
    household: query.householdId,
    user: req.userId,
  });

  if (!membership) {
    throw ApiError.forbidden('Voce nao tem acesso a esta casa.', ErrorCode.NOT_HOUSEHOLD_MEMBER);
  }

  const household = await Household.findById(query.householdId);

  const score = await memberScore(household, req.userId, {
    period: query.period || 'month',
    from: query.from,
    to: query.to,
  });

  return ok(res, score);
};
