// controllers/executionController.js
// Execucoes da casa e a conferencia por OUTRO membro.
//
// A criacao de execucao sai daqui: no contrato ela acontece ao concluir uma
// ocorrencia (POST /occurrences/:id/complete), que chega na Fase 3 junto com o
// motor de recorrencia. Ate la, o unico caminho de escrita e a avaliacao.

const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, pageMeta } = require('../utils/respond');
const { skipFor } = require('../utils/pagination');

// @desc    Listar as execucoes da casa
// @route   GET /api/v1/households/:householdId/executions
// @access  Membro da casa
// Antes filtrava por executedBy: so dava para ver a propria execucao, o que
// tornava qualquer visao de conjunto (e o ranking) impossivel.
exports.listByHousehold = async (req, res) => {
  const { from, to, executedBy, page, pageSize } = req.validatedQuery;

  const filter = { household: req.household._id };

  if (executedBy) {
    filter.executedBy = executedBy;
  }

  if (from || to) {
    filter.completionDate = {};
    // Limites em UTC. A Fase 2 passa a interpretar o dia no fuso da casa.
    if (from) filter.completionDate.$gte = new Date(from + 'T00:00:00.000Z');
    if (to) filter.completionDate.$lte = new Date(to + 'T23:59:59.999Z');
  }

  const [items, total] = await Promise.all([
    TaskExecutionHistory.find(filter)
      .populate('task', 'name difficulty')
      .populate('executedBy', 'name username')
      .sort({ completionDate: -1 })
      .skip(skipFor(page, pageSize))
      .limit(pageSize),
    TaskExecutionHistory.countDocuments(filter),
  ]);

  return ok(res, items, pageMeta(page, pageSize, total));
};

// @desc    Detalhe da execucao
// @route   GET /api/v1/executions/:executionId
// @access  Membro da casa da execucao
exports.getById = async (req, res) => {
  return ok(res, req.execution);
};

// @desc    Avaliar a execucao de outro membro
// @route   PATCH /api/v1/executions/:executionId/rating
// @access  Capability canRate, nunca quem executou
exports.rate = async (req, res) => {
  const execution = req.execution;

  // Regra central do produto, preservada desde o baseline.
  if (String(execution.executedBy) === req.userId) {
    throw ApiError.forbidden(
      'Voce nao pode avaliar a sua propria execucao.',
      ErrorCode.CANNOT_RATE_OWN_EXECUTION
    );
  }

  execution.rating = req.body.rating;

  if (req.body.note !== undefined) {
    // Campo proprio do avaliador: nao sobrescreve o comentario de quem executou.
    execution.ratingNote = req.body.note;
  }

  await execution.save();

  return ok(res, execution);
};
