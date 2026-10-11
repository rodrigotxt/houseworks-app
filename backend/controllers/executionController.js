// controllers/executionController.js
// Execucoes da casa e a conferencia por OUTRO membro.
//
// A criacao de execucao acontece em POST /occurrences/:id/complete
// (controllers/occurrenceController.js, Fase 3). Aqui mora a leitura e a avaliacao.

const TaskExecution = require('../models/TaskExecution');
const { ok, pageMeta } = require('../utils/respond');
const { skipFor } = require('../utils/pagination');
const { resolveCapabilities } = require('../utils/capabilities');
const { rateExecution, approveExpiredExecutions } = require('../services/executions');

const POPULATE = [
  { path: 'task', select: 'name difficulty' },
  { path: 'executedBy', select: 'name username' },
  { path: 'ratedBy', select: 'name username' },
];

function populated(query) {
  return query.populate(POPULATE);
}

// @desc    Listar as execucoes da casa
// @route   GET /api/v1/households/:householdId/executions
// @access  Membro da casa
exports.listByHousehold = async (req, res) => {
  const household = req.household;
  const query = req.validatedQuery;

  // Mesma filosofia do backfill de ocorrencias: a leitura tambem fecha a janela.
  await approveExpiredExecutions(household);

  const filter = { household: household._id };

  if (query.executedBy) {
    filter.executedBy = query.executedBy;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.pendingReviewForMe) {
    // Fila de conferencia: o que sobrou para EU avaliar. Quem nao avalia ve fila vazia.
    const capabilities = resolveCapabilities(req.membership.role, req.membership.overrides);

    if (!capabilities.canRate) {
      return ok(res, [], pageMeta(query.page, query.pageSize, 0));
    }

    filter.status = 'pending_review';
    filter.executedBy = { $ne: req.userId };
  }

  if (query.from || query.to) {
    filter.completionDate = {};
    // Limites em UTC. A Fase 4 passa a interpretar o dia no fuso da casa.
    if (query.from) filter.completionDate.$gte = new Date(query.from + 'T00:00:00.000Z');
    if (query.to) filter.completionDate.$lte = new Date(query.to + 'T23:59:59.999Z');
  }

  const [items, total] = await Promise.all([
    populated(TaskExecution.find(filter))
      .sort({ completionDate: -1 })
      .skip(skipFor(query.page, query.pageSize))
      .limit(query.pageSize),
    TaskExecution.countDocuments(filter),
  ]);

  return ok(res, items, pageMeta(query.page, query.pageSize, total));
};

// @desc    Detalhe da execucao
// @route   GET /api/v1/executions/:executionId
// @access  Membro da casa da execucao
exports.getById = async (req, res) => {
  await req.execution.populate(POPULATE);

  return ok(res, req.execution);
};

// @desc    Avaliar a execucao de outro membro
// @route   PATCH /api/v1/executions/:executionId/rating
// @access  Capability canRate, nunca quem executou
exports.rate = async (req, res) => {
  await rateExecution(req.execution, req.membership, req.household, req.body);

  await req.execution.populate(POPULATE);

  return ok(res, req.execution);
};
