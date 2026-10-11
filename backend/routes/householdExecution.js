// routes/householdExecution.js
// Execucoes DENTRO de uma casa. Montado por routes/household.js em
// /households/:householdId/executions.

const express = require('express');
const router = express.Router({ mergeParams: true });

const executionController = require('../controllers/executionController');
const { requireAuth } = require('../middlewares/auth');
const { requireMember } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { listExecutionsQuerySchema } = require('../schemas/execution');

// @route   GET /households/:householdId/executions
// @desc    Execucoes da casa
// @access  Membro da casa
router.get(
  '/',
  requireAuth,
  requireMember,
  validate({ query: listExecutionsQuerySchema }),
  asyncHandler(executionController.listByHousehold)
);

module.exports = router;
