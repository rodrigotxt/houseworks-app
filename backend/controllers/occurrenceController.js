// controllers/occurrenceController.js
// A agenda. Toda leitura faz backfill + marcacao de atraso antes de responder
// (services/occurrences.js), porque o job diario e otimizacao, nao requisito.

const Membership = require('../models/Membership');
const TaskOccurrence = require('../models/TaskOccurrence');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, pageMeta } = require('../utils/respond');
const { buildSort, skipFor } = require('../utils/pagination');
const { refreshHousehold } = require('../services/occurrences');
const { todayInZone, addDays, DEFAULT_TIMEZONE } = require('../services/time');

const OCCURRENCE_SORT_FIELDS = ['dueDate', 'createdAt', 'status'];

// Janela padrao: de hoje ate o horizonte materializado da casa.
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
      .populate('task', 'name difficulty')
      .populate('assignedTo', 'name username')
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

  // Se a janela pedida passa do horizonte materializado, gera o que falta agora.
  await refreshHousehold(household, { untilDate: range.to });

  const filter = applyCommonFilters(
    { household: household._id, dueDate: { $gte: range.from, $lte: range.to } },
    query
  );

  if (query.taskId) filter.task = query.taskId;

  const sort = buildSort(query.sort, OCCURRENCE_SORT_FIELDS, 'dueDate');
  const { items, total } = await paginate(filter, query, sort);

  return ok(res, items, pageMeta(query.page, query.pageSize, total));
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

  return ok(res, items, pageMeta(query.page, query.pageSize, total));
};

// @desc    Minha agenda (designadas a mim ou sem responsavel)
// @route   GET /api/v1/me/occurrences
// @access  Privado
exports.listMine = async (req, res) => {
  const query = req.validatedQuery;

  const membershipFilter = { user: req.userId };
  if (query.householdId) membershipFilter.household = query.householdId;

  const memberships = await Membership.find(membershipFilter).populate('household');

  // Pediu uma casa especifica sem ser membro dela.
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

  // Cada casa tem fuso e horizonte proprios.
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

  return ok(res, items, pageMeta(query.page, query.pageSize, total));
};

// @desc    Detalhe da ocorrencia
// @route   GET /api/v1/occurrences/:occurrenceId
// @access  Membro da casa da ocorrencia
exports.getById = async (req, res) => {
  await req.occurrence.populate('task', 'name difficulty');
  await req.occurrence.populate('assignedTo', 'name username');

  return ok(res, req.occurrence);
};
