// controllers/taskController.js
// Tarefas da casa. As rotas aninhadas chegam com req.household (requireMember);
// as rotas /tasks/:taskId chegam com req.task, req.membership e req.household (loadTask).
// Nao ha checagem de posse por createdBy: a visibilidade e a CASA.

const Task = require('../models/Task');
const Membership = require('../models/Membership');
const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, noContent, pageMeta } = require('../utils/respond');
const { pointsForDifficulty } = require('../utils/points');
const { buildSort, skipFor, escapeRegex } = require('../utils/pagination');
const { refreshHousehold, resetFutureOccurrences } = require('../services/occurrences');

const TASK_SORT_FIELDS = ['name', 'createdAt', 'updatedAt', 'points', 'difficulty'];

// O responsavel precisa ser membro da casa: sem isso a tarefa ficaria designada a
// alguem que nem enxerga a casa.
async function assertMemberOfHousehold(householdId, userId) {
  const membership = await Membership.findOne({ household: householdId, user: userId });

  if (!membership) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      { field: 'assignedTo', issue: 'O responsavel precisa ser membro desta casa.' },
    ]);
  }
}

// Rodizio e responsavel fixo se excluem: o gerador so pode escolher um dos dois.
function assertAssignmentConsistency(strategy, assignedTo) {
  if (strategy === 'rotate' && assignedTo) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      {
        field: 'assignedTo',
        issue: 'Com atribuicao em rodizio (rotate), envie assignedTo como null.',
      },
    ]);
  }
}

// @desc    Criar tarefa na casa
// @route   POST /api/v1/households/:householdId/tasks
// @access  Capability canManageTasks (owner ou adult)
exports.create = async (req, res) => {
  const { name, description, recurrence, difficulty, points, assignedTo, assignmentStrategy } =
    req.body;

  if (assignedTo) {
    await assertMemberOfHousehold(req.household._id, assignedTo);
  }

  assertAssignmentConsistency(assignmentStrategy, assignedTo);

  const task = await new Task({
    household: req.household._id,
    name,
    description,
    recurrence,
    difficulty,
    // Sem pontos informados, o pre-validate do modelo deriva da dificuldade.
    points,
    assignedTo: assignedTo || null,
    assignmentStrategy,
    createdBy: req.userId,
  }).save();

  // Materializa as ocorrencias ja na criacao: a agenda responde sem depender do job.
  await refreshHousehold(req.household);

  return created(res, task);
};

// @desc    Listar as tarefas da casa
// @route   GET /api/v1/households/:householdId/tasks
// @access  Membro da casa
// A visibilidade e a casa, nao quem criou — e o que corrige o P1 do roadmap.
exports.list = async (req, res) => {
  const { status, assignedTo, frequency, difficulty, q, sort, page, pageSize } =
    req.validatedQuery;

  const filter = { household: req.household._id, status: status || 'active' };

  if (assignedTo === 'unassigned') {
    filter.assignedTo = null;
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  }

  // A frequencia agora mora dentro da recorrencia; o nome do parametro segue o contrato.
  if (frequency) filter['recurrence.frequency'] = frequency;
  if (difficulty) filter.difficulty = difficulty;
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };

  const sortSpec = buildSort(sort, TASK_SORT_FIELDS, '-createdAt');

  const [items, total] = await Promise.all([
    Task.find(filter).sort(sortSpec).skip(skipFor(page, pageSize)).limit(pageSize),
    Task.countDocuments(filter),
  ]);

  return ok(res, items, pageMeta(page, pageSize, total));
};

// @desc    Detalhe da tarefa
// @route   GET /api/v1/tasks/:taskId
// @access  Membro da casa da tarefa
exports.getById = async (req, res) => {
  return ok(res, req.task);
};

// @desc    Atualizar tarefa
// @route   PATCH /api/v1/tasks/:taskId
// @access  Capability canManageTasks (owner ou adult)
exports.update = async (req, res) => {
  const task = req.task;
  const { name, description, recurrence, difficulty, points, assignedTo, assignmentStrategy, status } =
    req.body;

  if (assignedTo) {
    await assertMemberOfHousehold(task.household, assignedTo);
  }

  const nextStrategy =
    assignmentStrategy !== undefined ? assignmentStrategy : task.assignmentStrategy;
  const nextAssignedTo =
    assignedTo !== undefined ? assignedTo : task.assignedTo ? String(task.assignedTo) : null;

  assertAssignmentConsistency(nextStrategy, nextAssignedTo);

  if (name !== undefined) task.name = name;
  if (description !== undefined) task.description = description;

  if (recurrence !== undefined) {
    task.recurrence = recurrence;
  }

  if (difficulty !== undefined) {
    task.difficulty = difficulty;
    // Os pontos acompanham a dificuldade quando ela muda e os pontos nao vieram
    // explicitamente no mesmo pedido.
    if (points === undefined) {
      task.points = pointsForDifficulty(difficulty);
    }
  }

  if (points !== undefined) task.points = points;
  if (assignmentStrategy !== undefined) task.assignmentStrategy = assignmentStrategy;
  if (assignedTo !== undefined) task.assignedTo = assignedTo || null;

  if (status !== undefined) {
    task.status = status;
    task.archivedAt = status === 'archived' ? new Date() : null;
  }

  await task.save();

  // Mudar a recorrencia NAO reescreve o passado: apaga so o que esta pendente de hoje
  // em diante e regenera com a regra nova.
  if (recurrence !== undefined) {
    await resetFutureOccurrences(task, { timezone: req.household.timezone });
    await refreshHousehold(req.household);
  }

  return ok(res, task);
};

// @desc    Arquivar (padrao) ou excluir definitivamente (?hard=true) a tarefa
// @route   DELETE /api/v1/tasks/:taskId
// @access  Capability canManageTasks; hard delete exige owner
// Arquivar e o padrao de proposito: apagar destruiria o historico e o placar.
exports.remove = async (req, res) => {
  const task = req.task;

  if (req.query.hard === 'true') {
    if (req.membership.role !== 'owner') {
      throw ApiError.forbidden(
        'Apenas o owner pode excluir uma tarefa definitivamente.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }

    await TaskExecutionHistory.deleteMany({ task: task._id });
    await require('../models/TaskOccurrence').deleteMany({ task: task._id });
    await Task.deleteOne({ _id: task._id });

    return noContent(res);
  }

  // Idempotente: arquivar o que ja esta arquivado nao e erro.
  if (task.status !== 'archived') {
    task.status = 'archived';
    task.archivedAt = new Date();

    // A agenda para de gerar, mas as ocorrencias pendentes ja materializadas ficam:
    // apaga-las esconderia tarefas que alguem ainda pode cumprir.
    await task.save();
  }

  return noContent(res);
};
