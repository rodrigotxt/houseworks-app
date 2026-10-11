// middlewares/task.js
// Carrega a tarefa e resolve a membership a partir da CASA DA TAREFA.
//
// As rotas /tasks/:taskId nao recebem householdId, entao o escopo vem do proprio
// recurso. Quando o usuario nao e membro da casa da tarefa respondemos 404, e nao
// 403: assim nao vazamos a existencia de recursos de outras casas.
//
// A casa tambem vem carregada porque o gerador de ocorrencias precisa do fuso e do
// horizonte dela.

const Task = require('../models/Task');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');

async function loadTask(req, res, next) {
  const task = await Task.findById(req.params.taskId);

  if (!task) {
    throw ApiError.notFound('Tarefa nao encontrada.', ErrorCode.TASK_NOT_FOUND);
  }

  const membership = await Membership.findOne({
    household: task.household,
    user: req.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Tarefa nao encontrada.', ErrorCode.TASK_NOT_FOUND);
  }

  req.task = task;
  req.membership = membership;
  req.household = await Household.findById(task.household);

  return next();
}

module.exports = { loadTask: asyncHandler(loadTask) };
