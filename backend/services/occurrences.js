// services/occurrences.js
// Gerador de ocorrencias. Duas garantias importam aqui:
//
//   1. IDEMPOTENCIA — rodar duas vezes nao cria ocorrencia duplicada. A garantia nao
//      vem de checagem em memoria, e sim do indice unico {task, dueDate}: a insercao
//      duplicada simplesmente falha com 11000 e e ignorada.
//   2. BACKFILL — se o job diario nao rodou (container parado, deploy), a leitura da
//      agenda gera o que falta antes de responder. O job e otimizacao, nao requisito.

const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const TaskOccurrence = require('../models/TaskOccurrence');
const { expandDueDates } = require('./recurrence');
const { todayInZone, overdueCutoff, addDays, maxDate } = require('./time');

function isDuplicateOnly(error) {
  if (error.code === 11000) return true;

  if (Array.isArray(error.writeErrors) && error.writeErrors.length > 0) {
    return error.writeErrors.every((writeError) => {
      const code = writeError.code || (writeError.err && writeError.err.code);
      return code === 11000;
    });
  }

  return false;
}

// De onde a geracao comeca quando a tarefa ainda nao gerou nada.
//
// Deliberadamente NAO retrocedemos ate o inicio da recorrencia: uma tarefa diaria com
// startDate de 2020 materializaria anos de ocorrencias que ninguem vai fazer. A agenda
// olha para a frente.
function firstGenerationFrom(recurrence, today) {
  return maxDate(recurrence.startDate, today);
}

// Garante as ocorrencias de UMA tarefa ate "target" (inclusive).
async function ensureForTask(household, task, target, today) {
  if (task.status !== 'active') {
    return 0;
  }

  const from = task.occurrencesGeneratedUntil
    ? addDays(task.occurrencesGeneratedUntil, 1)
    : firstGenerationFrom(task.recurrence, today);

  if (from > target) {
    return 0;
  }

  const dates = expandDueDates(task.recurrence, { from, to: target });

  // Mesmo sem datas novas, o marcador avanca: evita reexpansao a cada leitura
  // (caso tipico de uma tarefa "ocasional" ja materializada).
  if (dates.length === 0) {
    task.occurrencesGeneratedUntil = target;
    await task.save();
    return 0;
  }

  let rotatingAssignees = null;

  if (task.assignmentStrategy === 'rotate') {
    const memberships = await Membership.find({ household: household._id }).sort({
      joinedAt: 1,
      _id: 1,
    });
    rotatingAssignees = memberships.map((membership) => membership.user);
  }

  const alreadyGenerated = await TaskOccurrence.countDocuments({ task: task._id });

  const documents = dates.map((dueDate, index) => ({
    household: household._id,
    task: task._id,
    dueDate,
    assignedTo: rotatingAssignees
      ? rotatingAssignees[(alreadyGenerated + index) % rotatingAssignees.length]
      : task.assignedTo,
    status: 'pending',
    // Copia dos pontos vigentes: mudar a tarefa depois nao reescreve o passado.
    points: task.points || 0,
  }));

  let created = 0;

  try {
    const inserted = await TaskOccurrence.insertMany(documents, { ordered: false });
    created = inserted.length;
  } catch (error) {
    if (!isDuplicateOnly(error)) {
      throw error;
    }
    // ordered:false continua inserindo o que nao conflita; as duplicatas sao o
    // proprio mecanismo de idempotencia funcionando.
    created = Array.isArray(error.insertedDocs) ? error.insertedDocs.length : 0;
  }

  task.occurrencesGeneratedUntil = target;
  await task.save();

  return created;
}

// Garante as ocorrencias de todas as tarefas ativas da casa.
async function ensureForHousehold(household, options) {
  const settings = options || {};
  const now = settings.now || new Date();
  const today = todayInZone(household.timezone, now);

  const horizon = addDays(today, household.horizonDays || 30);

  // Um pedido de agenda que vai alem do horizonte materializado faz backfill ate la.
  const target = settings.untilDate ? maxDate(horizon, settings.untilDate) : horizon;

  const tasks = await Task.find({ household: household._id, status: 'active' });
  let created = 0;

  for (const task of tasks) {
    created += await ensureForTask(household, task, target, today);
  }

  return created;
}

// Marca como atrasadas as ocorrencias cujo prazo ja passou.
//
// E um updateMany barato por leitura, e nao um calculo na projecao: assim o filtro
// "status=overdue" continua sendo um filtro de indice.
async function markOverdue(household, options) {
  const settings = options || {};
  const cutoff = overdueCutoff(household.timezone, household.overdueGraceHours, settings.now);

  const result = await TaskOccurrence.updateMany(
    { household: household._id, status: 'pending', dueDate: { $lte: cutoff } },
    { $set: { status: 'overdue' } }
  );

  return result.modifiedCount || 0;
}

// Geracao + atraso. E o que as rotas de agenda chamam antes de responder.
async function refreshHousehold(household, options) {
  const created = await ensureForHousehold(household, options);
  const overdue = await markOverdue(household, options);

  return { created, overdue };
}

// Job diario: percorre todas as casas.
async function runDailyJob(options) {
  const households = await Household.find();
  const summary = { households: households.length, created: 0, overdue: 0 };

  for (const household of households) {
    const result = await refreshHousehold(household, options);
    summary.created += result.created;
    summary.overdue += result.overdue;
  }

  return summary;
}

// Chamado quando a recorrencia ou os pontos da tarefa mudam.
//
// O contrato e explicito: alterar a recorrencia NAO reescreve o passado. Apagamos
// apenas as ocorrencias pendentes de hoje em diante e recuamos o marcador para ontem,
// de modo que a proxima geracao use a regra nova sem tocar no historico.
async function resetFutureOccurrences(task, options) {
  const settings = options || {};
  const today = todayInZone(settings.timezone, settings.now);

  const result = await TaskOccurrence.deleteMany({
    task: task._id,
    status: 'pending',
    dueDate: { $gte: today },
  });

  task.occurrencesGeneratedUntil = addDays(today, -1);
  await task.save();

  return result.deletedCount || 0;
}

module.exports = {
  ensureForTask,
  ensureForHousehold,
  markOverdue,
  refreshHousehold,
  runDailyJob,
  resetFutureOccurrences,
  firstGenerationFrom,
};
