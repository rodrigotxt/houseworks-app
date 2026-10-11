// routes/occurrence.js

const express = require('express');
const router = express.Router();

const occurrenceController = require('../controllers/occurrenceController');
const { requireAuth } = require('../middlewares/auth');
const { authorize } = require('../middlewares/membership');
const { loadOccurrence } = require('../middlewares/occurrence');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { completeOccurrenceSchema, skipOccurrenceSchema } = require('../schemas/occurrence');

// @route   POST /occurrences/:occurrenceId/complete
// @desc    Concluir a ocorrencia (cria a execucao)
// @access  Membro da casa; quem nao administra tarefas so conclui as proprias
router.post(
  '/:occurrenceId/complete',
  requireAuth,
  loadOccurrence,
  validate({ body: completeOccurrenceSchema }),
  asyncHandler(occurrenceController.complete)
);

// @route   POST /occurrences/:occurrenceId/skip
// @desc    Pular a ocorrencia com justificativa
// @access  owner ou adult
router.post(
  '/:occurrenceId/skip',
  requireAuth,
  loadOccurrence,
  authorize('canManageTasks'),
  validate({ body: skipOccurrenceSchema }),
  asyncHandler(occurrenceController.skip)
);

// @route   POST /occurrences/:occurrenceId/undo
// @desc    Desfazer a conclusao (remove a execucao e os pontos)
// @access  owner, ou quem executou dentro da janela de avaliacao
router.post(
  '/:occurrenceId/undo',
  requireAuth,
  loadOccurrence,
  asyncHandler(occurrenceController.undo)
);

// @route   GET /occurrences/:occurrenceId/executions
// @desc    Historico de execucoes da ocorrencia
// @access  Membro da casa
router.get(
  '/:occurrenceId/executions',
  requireAuth,
  loadOccurrence,
  asyncHandler(occurrenceController.listExecutions)
);

// @route   GET /occurrences/:occurrenceId
// @desc    Detalhe da ocorrencia
// @access  Membro da casa da ocorrencia
router.get(
  '/:occurrenceId',
  requireAuth,
  loadOccurrence,
  asyncHandler(occurrenceController.getById)
);

module.exports = router;
