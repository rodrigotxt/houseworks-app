// controllers/occurrenceController.js
// A agenda e o ciclo de vida da ocorrencia.
//
// Toda leitura faz backfill + marcacao de atraso + auto-aprovacao antes de responder
// (services/occurrences.js). O job diario e otimizacao, nao requisito de correcao.

const Membership = require('../models/Membership');
const TaskOccurrence = require('../models/TaskOccurrence');
const TaskExecution = require('../models/TaskExecution');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, pageMeta } = require('../utils/respond');
const { buildSort, skipFor } = require('../utils/pagination');
const { occurrenceView, occurrenceList } = require('../utils/occurrenceView');
const { refreshHousehold } = require('../services/occurrences');
const {
  completeOccurrence,
  skipOccurrence,
  undoOccurrence,
} = require('../services/executions');
const { todayInZone, addDays, DEFAULT_TIMEZONE } = require('../services/time');

const OCCURRENCE_SORT_FIELDS = ['dueDate', 'createdAt', 'status'];

// O contrato expoe task, assignedTo e completedBy como objetos, nao como ids soltos.
const OCCURRENCE_POPULATE = [
  // estimatedMinutes entra aqui para a agenda comparar a carga do dia com o tempo livre
  // de cada pessoa sem uma segunda chamada por tarefa.
  { path: 'task', select: 'name difficulty estimatedMinutes' },
  { path: 'assignedTo', select: 'name username' },
  { path: 'completedBy', select: 'name username' },
];

function defaultWindow(household, query) {
  const today = todayInZone(household.timezone);
  return {
    from: query.from || today,
    to: query.to || addDays(today, household.horizonDays || 30),
  };
}

function applyCommonFilters(filter, query) {
  if (query.status) filter.status = query.status;

  if (query.assignedTo === 'unassigned') {
    filter.assignedTo = null;
  } else if (query.assignedTo) {
    filter.assignedTo = query.assignedTo;
  }

  return filter;
}

async function paginate(filter, query, sort) {
  const [items, total] = await Promise.all([
    TaskOccurrence.find(filter)
      .populate(OCCURRENCE_POPULATE)
      .sort(sort)
      .skip(skipFor(query.page, query.pageSize))
      .limit(query.pageSize),
    TaskOccurrence.countDocuments(filter),
  ]);

  return { items, total };
}

// @desc    Agenda da casa
// @route   GET /api/v1/households/:householdId/occurrences
// @access  Membro da casa
exports.listByHousehold = async (req, res) => {
  const household = req.household;
  const query = req.validatedQuery;
  const range = defaultWindow(household, query);

  await refreshHousehold(household, { untilDate: range.to });

  const filter = applyCommonFilters(
    { household: household._id, dueDate: { $gte: range.from, $lte: range.to } },
    query
  );

  if (query.taskId) filter.task = query.taskId;

  const sort = buildSort(query.sort, OCCURRENCE_SORT_FIELDS, 'dueDate');
  const { items, total } = await paginate(filter, query, sort);

  return ok(res, occurrenceList(items, household.timezone), pageMeta(query.page, query.pageSize, total));
};

// @desc    Ocorrencias de uma tarefa
// @route   GET /api/v1/tasks/:taskId/occurrences
// @access  Membro da casa da tarefa
exports.listByTask = async (req, res) => {
  const household = req.household;
  const query = req.validatedQuery;
  const range = defaultWindow(household, query);

  await refreshHousehold(household, { untilDate: range.to });

  const filter = applyCommonFilters(
    {
      household: household._id,
      task: req.task._id,
      dueDate: { $gte: range.from, $lte: range.to },
    },
    query
  );

  const sort = buildSort(query.sort, OCCURRENCE_SORT_FIELDS, 'dueDate');
  const { items, total } = await paginate(filter, query, sort);

  return ok(res, occurrenceList(items, household.timezone), pageMeta(query.page, query.pageSize, total));
};

// @desc    Minha agenda (designadas a mim ou sem responsavel)
// @route   GET /api/v1/me/occurrences
// @access  Privado
exports.listMine = async (req, res) => {
  const query = req.validatedQuery;

  const membershipFilter = { user: req.userId };
  if (query.householdId) membershipFilter.household = query.householdId;

  const memberships = await Membership.find(membershipFilter).populate('household');

  if (query.householdId && memberships.length === 0) {
    throw ApiError.forbidden('Voce nao tem acesso a esta casa.', ErrorCode.NOT_HOUSEHOLD_MEMBER);
  }

  const households = memberships.map((membership) => membership.household).filter(Boolean);

  if (households.length === 0) {
    return ok(res, [], pageMeta(query.page, query.pageSize, 0));
  }

  const today = todayInZone(DEFAULT_TIMEZONE);
  const from = query.from || today;
  const to = query.to || addDays(today, 30);

  for (const household of households) {
    await refreshHousehold(household, { untilDate: to });
  }

  const filter = applyCommonFilters(
    {
      household: { $in: households.map((household) => household._id) },
      dueDate: { $gte: from, $lte: to },
      // "Minhas" = designadas a mim ou ainda sem responsavel.
      $or: [{ assignedTo: req.userId }, { assignedTo: null }],
    },
    query
  );

  const sort = buildSort(query.sort, OCCURRENCE_SORT_FIELDS, 'dueDate');
  const { items, total } = await paginate(filter, query, sort);

  // Cada casa tem o proprio fuso: o isLate precisa ser calculado por casa.
  const fusoDe = {};
  households.forEach((household) => {
    fusoDe[String(household._id)] = household.timezone;
  });

  const views = items.map((ocorrencia) =>
    occurrenceView(ocorrencia, fusoDe[String(ocorrencia.household)] || DEFAULT_TIMEZONE)
  );

  return ok(res, views, pageMeta(query.page, query.pageSize, total));
};

// @desc    Detalhe da ocorrencia
// @route   GET /api/v1/occurrences/:occurrenceId
// @access  Membro da casa da ocorrencia
exports.getById = async (req, res) => {
  await req.occurrence.populate(OCCURRENCE_POPULATE);

  return ok(res, occurrenceView(req.occurrence, req.household.timezone));
};

// @desc    Concluir a ocorrencia
// @route   POST /api/v1/occurrences/:occurrenceId/complete
// @access  Membro da casa (quem nao administra tarefas so conclui as proprias)
exports.complete = async (req, res) => {
  const execution = await completeOccurrence(req.occurrence, req.membership, req.body);

  // A resposta do contrato traz o resumo da tarefa e o UserRef de quem executou.
  await execution.populate([
    { path: 'task', select: 'name difficulty' },
    { path: 'executedBy', select: 'name username' },
  ]);

  await req.occurrence.populate(OCCURRENCE_POPULATE);

  return created(res, {
    occurrence: occurrenceView(req.occurrence, req.household.timezone),
    execution,
  });
};

// @desc    Pular a ocorrencia
// @route   POST /api/v1/occurrences/:occurrenceId/skip
// @access  owner ou adult
exports.skip = async (req, res) => {
  await skipOccurrence(req.occurrence, req.body);

  await req.occurrence.populate(OCCURRENCE_POPULATE);

  return ok(res, occurrenceView(req.occurrence, req.household.timezone));
};

// @desc    Desfazer a conclusao
// @route   POST /api/v1/occurrences/:occurrenceId/undo
// @access  owner, ou quem executou dentro da janela de avaliacao
exports.undo = async (req, res) => {
  await undoOccurrence(req.occurrence, req.membership, req.household);

  await req.occurrence.populate(OCCURRENCE_POPULATE);

  return ok(res, occurrenceView(req.occurrence, req.household.timezone));
};

// @desc    Historico de execucoes de uma ocorrencia
// @route   GET /api/v1/occurrences/:occurrenceId/executions
// @access  Membro da casa
exports.listExecutions = async (req, res) => {
  const executions = await TaskExecution.find({ occurrence: req.occurrence._id })
    .populate('task', 'name difficulty')
    .populate('executedBy', 'name username')
    .populate('ratedBy', 'name username')
    .sort({ completionDate: -1 });

  return ok(res, executions);
};
