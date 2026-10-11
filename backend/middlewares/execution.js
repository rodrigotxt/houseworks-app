// middlewares/execution.js
// Mesma logica de middlewares/task.js: o escopo vem do recurso, e quem nao e membro
// da casa recebe 404 em vez de 403.
//
// A casa tambem vem carregada: a avaliacao depende da janela de avaliacao dela.

const TaskExecution = require('../models/TaskExecution');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');

async function loadExecution(req, res, next) {
  const execution = await TaskExecution.findById(req.params.executionId);

  if (!execution) {
    throw ApiError.notFound('Execucao nao encontrada.', ErrorCode.EXECUTION_NOT_FOUND);
  }

  const membership = await Membership.findOne({
    household: execution.household,
    user: req.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Execucao nao encontrada.', ErrorCode.EXECUTION_NOT_FOUND);
  }

  req.execution = execution;
  req.membership = membership;
  req.household = await Household.findById(execution.household);

  return next();
}

module.exports = { loadExecution: asyncHandler(loadExecution) };
