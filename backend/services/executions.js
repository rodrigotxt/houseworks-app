// services/executions.js
// Ciclo de vida da execucao: concluir, pular, desfazer, avaliar e auto-aprovar.
//
// Fica aqui, e nao no controller, porque sao regras de negocio com varias
// pre-condicoes — e porque a auto-aprovacao precisa ser chamavel tanto pelo job
// diario quanto pela leitura (mesma filosofia do backfill de ocorrencias).

const { DateTime } = require('luxon');

const TaskExecution = require('../models/TaskExecution');
const Task = require('../models/Task');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { audit } = require('../utils/audit');
const { resolveCapabilities } = require('../utils/capabilities');
const { zoneOf, overdueCutoff } = require('./time');

// Registro retroativo: da para marcar o que esqueceu, mas nao reescrever o mes passado.
const RETROACTIVE_LIMIT_DAYS = 7;

// Tolerancia para relogio levemente adiantado entre cliente e servidor.
const CLOCK_SKEW_MS = 60 * 1000;

function deadlineOf(household, execution) {
  return DateTime.fromJSDate(execution.completionDate).plus({
    hours: household.ratingWindowHours || 72,
  });
}

// A janela de avaliacao ainda esta aberta?
function isRatingWindowOpen(household, execution, now) {
  return deadlineOf(household, execution) > DateTime.fromJSDate(now || new Date());
}

function assertCompletionDateInRange(completionDate, now) {
  const reference = now || new Date();
  const oldest = reference.getTime() - RETROACTIVE_LIMIT_DAYS * 24 * 60 * 60 * 1000;

  if (completionDate.getTime() > reference.getTime() + CLOCK_SKEW_MS) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      { field: 'completionDate', issue: 'A data de conclusao nao pode estar no futuro.' },
    ]);
  }

  if (completionDate.getTime() < oldest) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      {
        field: 'completionDate',
        issue: 'O registro retroativo e limitado a ' + RETROACTIVE_LIMIT_DAYS + ' dias.',
      },
    ]);
  }
}

// Quem pode concluir: quem administra tarefas conclui qualquer ocorrencia; os demais
// apenas as proprias ou as que nao tem responsavel definido.
function assertCanComplete(occurrence, membership) {
  if (occurrence.status === 'done' || occurrence.status === 'skipped') {
    throw ApiError.conflict(
      'Esta ocorrencia ja foi concluida ou pulada.',
      ErrorCode.OCCURRENCE_ALREADY_COMPLETED
    );
  }

  const capabilities = resolveCapabilities(membership.role, membership.overrides);

  if (capabilities.canManageTasks) {
    return;
  }

  const assignedTo = occurrence.assignedTo ? String(occurrence.assignedTo) : null;

  if (assignedTo && assignedTo !== String(membership.user)) {
    throw ApiError.forbidden(
      'Esta ocorrencia esta designada a outro membro.',
      ErrorCode.OCCURRENCE_NOT_ASSIGNED_TO_YOU
    );
  }
}

// @desc  Concluir a ocorrencia: cria a execucao e fecha a ocorrencia.
async function completeOccurrence(occurrence, membership, input, options) {
  const now = (options && options.now) || new Date();
  const payload = input || {};

  assertCanComplete(occurrence, membership);

  const completionDate = payload.completionDate || now;
  assertCompletionDateInRange(completionDate, now);

  // Retrato do tempo: a estimativa VIGENTE agora. Se a tarefa nao tiver estimativa,
  // fica null e nao ha o que comparar depois.
  const taskRef = occurrence.task && occurrence.task._id ? occurrence.task._id : occurrence.task;
  const tarefa = await Task.findById(taskRef).select('estimatedMinutes');
  const estimatedMinutes = tarefa && tarefa.estimatedMinutes != null ? tarefa.estimatedMinutes : null;

  const execution = await new TaskExecution({
    household: occurrence.household,
    occurrence: occurrence._id,
    task: occurrence.task,
    // Eixo do relatorio de desempenho (desnormalizado — ver models/TaskExecution.js).
    dueDate: occurrence.dueDate,
    executedBy: membership.user,
    completionDate,
    note: payload.note,
    status: 'pending_review',
    // Copia dos pontos: mudar a tarefa depois nao reescreve o que ja valeu.
    points: occurrence.points || 0,
    estimatedMinutes,
    // So grava o que a pessoa informou. O "vale a estimativa" e aplicado por quem le
    // (actualMinutes ?? estimatedMinutes), nao aqui: gravar o presumido apagaria a
    // diferenca entre tempo medido e tempo chutado.
    actualMinutes: payload.actualMinutes ?? null,
  }).save();

  occurrence.status = 'done';
  occurrence.completedAt = completionDate;
  occurrence.completedBy = membership.user;
  await occurrence.save();

  await Task.updateOne({ _id: occurrence.task }, { $set: { lastCompletedDate: completionDate } });

  return execution;
}

// @desc  Pular a ocorrencia (com justificativa). Nao gera pontos nem conta como atraso.
async function skipOccurrence(occurrence, input) {
  const payload = input || {};

  if (occurrence.status === 'done') {
    throw ApiError.conflict(
      'Esta ocorrencia ja foi concluida.',
      ErrorCode.OCCURRENCE_ALREADY_COMPLETED
    );
  }

  occurrence.status = 'skipped';
  occurrence.skippedReason = payload.reason || null;

  await occurrence.save();

  return occurrence;
}

// @desc  Desfazer a conclusao.
//
// Owner desfaz qualquer uma; quem executou desfaz a propria enquanto a janela de
// avaliacao estiver aberta. A execucao e REMOVIDA — os pontos saem do placar por
// consequencia, sem nenhum ajuste manual.
async function undoOccurrence(occurrence, membership, household, options) {
  const now = (options && options.now) || new Date();

  if (occurrence.status !== 'done') {
    throw ApiError.conflict(
      'Esta ocorrencia nao esta concluida.',
      ErrorCode.OCCURRENCE_NOT_COMPLETED
    );
  }

  const execution = await TaskExecution.findOne({ occurrence: occurrence._id }).sort({
    completionDate: -1,
  });

  if (!execution) {
    throw ApiError.conflict(
      'Esta ocorrencia nao esta concluida.',
      ErrorCode.OCCURRENCE_NOT_COMPLETED
    );
  }

  const isOwner = membership.role === 'owner';
  const isExecutor = String(execution.executedBy) === String(membership.user);

  if (!isOwner) {
    const withinWindow = isRatingWindowOpen(household, execution, now);

    if (!isExecutor || !withinWindow) {
      throw ApiError.forbidden(
        'Voce nao pode desfazer esta conclusao.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }
  }

  audit('execution.undone', {
    executionId: String(execution._id),
    occurrenceId: String(occurrence._id),
    householdId: String(occurrence.household),
    undoneBy: String(membership.user),
    wasRatedBy: execution.ratedBy ? String(execution.ratedBy) : null,
    points: execution.points,
  });

  await TaskExecution.deleteOne({ _id: execution._id });

  // A ocorrencia volta ao estado que o calendario determina hoje — nao a "pending"
  // cego, senao uma ocorrencia vencida reapareceria como se ainda desse tempo.
  const cutoff = overdueCutoff(household.timezone, household.overdueGraceHours, now);

  occurrence.status = occurrence.dueDate <= cutoff ? 'overdue' : 'pending';
  occurrence.completedAt = null;
  occurrence.completedBy = null;
  await occurrence.save();

  return occurrence;
}

// @desc  Avaliar a execucao de outro membro.
async function rateExecution(execution, membership, household, input, options) {
  const now = (options && options.now) || new Date();

  // Regra central do produto.
  if (String(execution.executedBy) === String(membership.user)) {
    throw ApiError.forbidden(
      'Voce nao pode avaliar a sua propria execucao.',
      ErrorCode.CANNOT_RATE_OWN_EXECUTION
    );
  }

  // A ordem importa: avaliar duas vezes e um erro diferente de avaliar atrasado.
  if (execution.status !== 'pending_review') {
    throw ApiError.conflict(
      'Esta execucao ja foi avaliada.',
      ErrorCode.EXECUTION_ALREADY_RATED
    );
  }

  if (!isRatingWindowOpen(household, execution, now)) {
    throw ApiError.conflict(
      'O prazo para avaliar esta execucao expirou.',
      ErrorCode.RATING_WINDOW_CLOSED
    );
  }

  execution.rating = input.rating;
  execution.ratingNote = input.note;
  execution.ratedBy = membership.user;
  execution.ratedAt = now;
  execution.status = 'approved';

  await execution.save();

  return execution;
}

// @desc  Auto-aprovacao: ninguem fica preso a um avaliador ausente.
//
// Roda no job diario E em toda leitura de execucoes — o job e otimizacao, nao requisito.
async function approveExpiredExecutions(household, options) {
  const now = (options && options.now) || new Date();

  const deadline = DateTime.fromJSDate(now)
    .minus({ hours: household.ratingWindowHours || 72 })
    .toJSDate();

  const result = await TaskExecution.updateMany(
    { household: household._id, status: 'pending_review', completionDate: { $lte: deadline } },
    { $set: { status: 'auto_approved', ratedAt: now } }
  );

  return result.modifiedCount || 0;
}

module.exports = {
  RETROACTIVE_LIMIT_DAYS,
  isRatingWindowOpen,
  deadlineOf,
  completeOccurrence,
  skipOccurrence,
  undoOccurrence,
  rateExecution,
  approveExpiredExecutions,
  zoneOf,
};
