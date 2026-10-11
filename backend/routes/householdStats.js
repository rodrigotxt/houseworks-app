// routes/householdStats.js
// Desempenho DENTRO de uma casa. Montado por routes/household.js.

const express = require('express');
const router = express.Router({ mergeParams: true });

const statsController = require('../controllers/statsController');
const { requireAuth } = require('../middlewares/auth');
const { requireMember } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { statsQuerySchema, leaderboardQuerySchema } = require('../schemas/stats');

// @route   GET /households/:householdId/stats
// @desc    Estatisticas da casa
// @access  Membro da casa
router.get(
  '/stats',
  requireAuth,
  requireMember,
  validate({ query: statsQuerySchema }),
  asyncHandler(statsController.household)
);

// @route   GET /households/:householdId/leaderboard
// @desc    Ranking da casa
// @access  Membro da casa
router.get(
  '/leaderboard',
  requireAuth,
  requireMember,
  validate({ query: leaderboardQuerySchema }),
  asyncHandler(statsController.leaderboard)
);

module.exports = router;
