// routes/taskExecutionHistory.js
const express = require('express');
const router = express.Router();

const taskExecutionHistoryController = require('../controllers/taskExecutionHistoryController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const {
  createExecutionSchema,
  addNoteOrRatingSchema,
} = require('../schemas/taskExecutionHistory');

// @route   POST /tasks-executions
// @desc    Registrar uma nova execucao de tarefa (marcar como concluida)
// @access  Privado
router.post(
  '/',
  auth,
  validate({ body: createExecutionSchema }),
  asyncHandler(taskExecutionHistoryController.createTaskExecution)
);

// @route   PATCH /tasks-executions/:taskExecutionId
// @desc    Registrar rating ou note para uma execucao de tarefa
// @access  Privado
router.patch(
  '/:taskExecutionId',
  auth,
  validate({ body: addNoteOrRatingSchema }),
  asyncHandler(taskExecutionHistoryController.addNoteOrRating)
);

// @route   GET /tasks-executions
// @desc    Obter todas as execucoes de tarefas do usuario logado
// @access  Privado
router.get('/', auth, asyncHandler(taskExecutionHistoryController.getTaskExecutions));

// @route   GET /tasks-executions/task/:taskId
// @desc    Obter o historico de execucoes para uma tarefa especifica
// @access  Privado
router.get('/task/:taskId', auth, asyncHandler(taskExecutionHistoryController.getExecutionsByTask));

module.exports = router;
