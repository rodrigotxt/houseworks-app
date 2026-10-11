// routes/task.js
// Tarefa por id. Sem householdId na rota: o escopo vem do proprio recurso
// (middlewares/task.js resolve a membership a partir da casa da tarefa).

const express = require('express');
const router = express.Router();

const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middlewares/auth');
const { authorize } = require('../middlewares/membership');
const { loadTask } = require('../middlewares/task');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { updateTaskSchema } = require('../schemas/task');
const { listTaskOccurrencesQuerySchema } = require('../schemas/occurrence');
const occurrenceController = require('../controllers/occurrenceController');

// @route   GET /tasks/:taskId
// @desc    Detalhe da tarefa
// @access  Membro da casa da tarefa
router.get('/:taskId', requireAuth, loadTask, asyncHandler(taskController.getById));

// @route   GET /tasks/:taskId/occurrences
// @desc    Ocorrencias de uma tarefa
// @access  Membro da casa da tarefa
router.get(
  '/:taskId/occurrences',
  requireAuth,
  loadTask,
  validate({ query: listTaskOccurrencesQuerySchema }),
  asyncHandler(occurrenceController.listByTask)
);

// @route   PATCH /tasks/:taskId
// @desc    Atualizar tarefa
// @access  owner ou adult
router.patch(
  '/:taskId',
  requireAuth,
  loadTask,
  authorize('canManageTasks'),
  validate({ body: updateTaskSchema }),
  asyncHandler(taskController.update)
);

// @route   DELETE /tasks/:taskId
// @desc    Arquivar (padrao) ou excluir (?hard=true, apenas owner)
// @access  owner ou adult
router.delete('/:taskId', requireAuth, loadTask, asyncHandler(taskController.remove));

module.exports = router;
