// controllers/taskExecutionHistoryController.js

const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const Task = require('../models/Task');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created } = require('../utils/respond');

// @desc    Registrar uma nova execucao de tarefa
// @route   POST /api/v1/tasks-executions
// @access  Privado
exports.createTaskExecution = async (req, res) => {
  const { taskId, note, rating } = req.body;
  const executedBy = req.user.id;

  const task = await Task.findById(taskId);
  if (!task) {
    throw ApiError.notFound('Tarefa nao encontrada.', ErrorCode.TASK_NOT_FOUND);
  }

  // PENDENCIA CONHECIDA (docs/ROADMAP.md, P4): hoje qualquer usuario autenticado pode
  // registrar execucao para qualquer tarefa, porque ainda nao existe Household para
  // delimitar "mesma casa". A checagem entra na Fase 1, junto com requireMember().

  const execution = await new TaskExecutionHistory({
    task: taskId,
    executedBy,
    note,
    rating,
  }).save();

  task.lastCompletedDate = execution.completionDate;
  await task.save();

  return created(res, execution);
};

// @desc    Obter o historico de execucoes do usuario logado
// @route   GET /api/v1/tasks-executions
// @access  Privado
exports.getTaskExecutions = async (req, res) => {
  const executions = await TaskExecutionHistory.find({ executedBy: req.user.id })
    .populate('task', 'name difficulty')
    .populate('executedBy', 'name username email')
    .sort({ completionDate: -1 });

  return ok(res, executions);
};

// @desc    Obter o historico de execucoes de uma tarefa
// @route   GET /api/v1/tasks-executions/task/:taskId
// @access  Privado
exports.getExecutionsByTask = async (req, res) => {
  const { taskId } = req.params;

  const executions = await TaskExecutionHistory.find({ task: taskId })
    .populate('executedBy', 'name username email')
    .sort({ completionDate: -1 });

  return ok(res, executions);
};

// @desc    Registrar nota ou avaliacao de uma execucao
// @route   PATCH /api/v1/tasks-executions/:taskExecutionId
// @access  Privado
exports.addNoteOrRating = async (req, res) => {
  const { taskExecutionId } = req.params;

  const execution = await TaskExecutionHistory.findById(taskExecutionId);
  if (!execution) {
    throw ApiError.notFound('Execucao nao encontrada.', ErrorCode.EXECUTION_NOT_FOUND);
  }

  // Regra central do produto: quem executou nao avalia a propria execucao.
  if (execution.executedBy.toString() === req.user.id) {
    throw ApiError.forbidden(
      'Voce nao pode avaliar a sua propria execucao.',
      ErrorCode.CANNOT_RATE_OWN_EXECUTION
    );
  }

  const { note, rating } = req.body;
  if (note !== undefined) execution.note = note;
  if (rating !== undefined) execution.rating = rating;

  await execution.save();

  return ok(res, execution);
};
