// routes/execution.js
// Execucao por id. O escopo vem do recurso (middlewares/execution.js).

const express = require('express');
const router = express.Router();

const executionController = require('../controllers/executionController');
const { requireAuth } = require('../middlewares/auth');
const { authorize } = require('../middlewares/membership');
const { loadExecution } = require('../middlewares/execution');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { rateExecutionSchema } = require('../schemas/execution');

// @route   GET /executions/:executionId
// @desc    Detalhe da execucao
// @access  Membro da casa da execucao
router.get('/:executionId', requireAuth, loadExecution, asyncHandler(executionController.getById));

// @route   PATCH /executions/:executionId/rating
// @desc    Avaliar a execucao de outro membro
// @access  owner ou adult, nunca quem executou
router.patch(
  '/:executionId/rating',
  requireAuth,
  loadExecution,
  authorize('canRate'),
  validate({ body: rateExecutionSchema }),
  asyncHandler(executionController.rate)
);

module.exports = router;
