// services/stats.js
// Desempenho da casa. TUDO e agregado no Mongo — nada e somado no Node nem no front.
//
// EIXO UNICO: a data de VENCIMENTO da ocorrencia (dueDate). "A semana" significa "as
// tarefas cuja semana era esta", e nao "o que foi marcado como feito nestes 7 dias".
// Isso mantem o relatorio alinhado com a agenda que a familia ve na tela.
//
// Duas consequencias que valem registrar:
//   - uma ocorrencia vencida domingo e concluida na segunda conta para a semana ANTERIOR;
//   - membros sao medidos por quem EXECUTOU (executedBy), nao por quem foi designado —
//     assignedTo e frequentemente nulo ("qualquer um pode assumir"), entao agrupar por
//     ele deixaria a maior parte do trabalho sem dono.

const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const TaskOccurrence = require('../models/TaskOccurrence');
const TaskExecution = require('../models/TaskExecution');
const Membership = require('../models/Membership');

const { zoneOf, todayInZone } = require('./time');

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const APPROVED = ['approved', 'auto_approved'];
const DEFAULT_STATS_DAYS = 30;

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function round(value, casas) {
  const fator = Math.pow(10, casas);
  return Math.round((value || 0) * fator) / fator;
}

function rate(parte, total) {
  return total > 0 ? round(parte / total, 4) : 0;
}

// Janela do periodo no calendario da casa.
// A semana comeca no DOMINGO — mesma convencao dos weekdays da recorrencia (0 = domingo).
// O periodo e o calendario CHEIO: a semana inteira, nao "ate hoje". Num periodo em
// andamento isso faz a taxa de conclusao parecer baixa, e ela de fato e: a semana nao acabou.
function periodWindow(period, household, now) {
  const zone = zoneOf(household.timezone);
  const hoje = DateTime.fromJSDate(now || new Date()).setZone(zone).startOf('day');

  if (period === 'week') {
    // luxon: 1 = segunda ... 7 = domingo. O modulo alinha a semana no domingo.
    const inicio = hoje.minus({ days: hoje.weekday % 7 });
    return { from: inicio.toISODate(), to: inicio.plus({ days: 6 }).toISODate() };
  }

  if (period === 'month') {
    return { from: hoje.startOf('month').toISODate(), to: hoje.endOf('month').toISODate() };
  }

  return null;
}

// Janela efetiva: from/to explicitos vencem; senao o periodo; senao os ultimos N dias.
async function resolveWindow(household, options) {
  const settings = options || {};
  const hoje = todayInZone(household.timezone, settings.now);

  if (settings.from && settings.to) {
    return { from: settings.from, to: settings.to, period: settings.period || 'all' };
  }

  if (settings.period && settings.period !== 'all') {
    const janela = periodWindow(settings.period, household, settings.now);
    return Object.assign({ period: settings.period }, janela);
  }

  if (settings.period === 'all') {
    const primeira = await TaskOccurrence.findOne({ household: household._id })
      .sort({ dueDate: 1 })
      .select('dueDate');

    return { from: primeira ? primeira.dueDate : hoje, to: hoje, period: 'all' };
  }

  return { from: DateTime.fromISO(hoje).minus({ days: DEFAULT_STATS_DAYS }).toISODate(), to: hoje };
}

// Atraso em horas contado do FIM do dia de vencimento (o prazo). Negativo = adiantado.
// O vencimento vem de "$dueDate" porque a consulta parte da ocorrencia (ver abaixo).
function delayHours(timezone) {
  return {
    $divide: [
      {
        $subtract: [
          '$completionDate',
          { $add: [{ $dateFromString: { dateString: '$dueDate', timezone } }, MS_PER_DAY] },
        ],
      },
      MS_PER_HOUR,
    ],
  };
}

// Concluida dentro do prazo? Compara o DIA LOCAL da conclusao com o dia de vencimento.
function onTime(timezone) {
  return {
    $lte: [
      { $dateToString: { date: '$completionDate', format: '%Y-%m-%d', timezone } },
      '$dueDate',
    ],
  };
}

// Metricas de execucao reutilizadas pelas duas agrupacoes.
function executionMetrics(timezone) {
  return {
    points: { $sum: { $cond: [{ $in: ['$status', APPROVED] }, '$points', 0] } },
    completed: { $sum: 1 },
    onTime: { $sum: { $cond: [onTime(timezone), 1, 0] } },
    ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
    ratingCount: {
      $sum: { $cond: [{ $ne: [{ $ifNull: ['$rating', null] }, null] }, 1, 0] },
    },
    delaySum: { $sum: delayHours(timezone) },
    delayCount: { $sum: 1 },
  };
}

// Execucoes da janela, agrupadas por executor E por tarefa numa unica passada.
//
// Varredura de indice puro: {household, dueDate, status} recorta a janela e o $facet
// produz as duas agrupacoes sem reabrir a colecao. A versao anterior comecava pela
// ocorrencia e juntava as execucoes uma a uma — 50 mil juncoes e 15s no historico
// completo. Por isso o dueDate e desnormalizado no modelo (ver models/TaskExecution.js).
async function executionTotals(householdId, from, to, timezone) {
  const [resultado] = await TaskExecution.aggregate([
    { $match: { household: householdId, dueDate: { $gte: from, $lte: to } } },
    {
      $facet: {
        byMember: [
          { $group: Object.assign({ _id: '$executedBy' }, executionMetrics(timezone)) },
        ],
        byTask: [{ $group: Object.assign({ _id: '$task' }, executionMetrics(timezone)) }],
      },
    },
  ]);

  return resultado || { byMember: [], byTask: [] };
}

async function occurrenceTotalsByStatus(householdId, from, to) {
  const linhas = await TaskOccurrence.aggregate([
    { $match: { household: householdId, dueDate: { $gte: from, $lte: to } } },
    { $group: { _id: '$status', total: { $sum: 1 } } },
  ]);

  const porStatus = { pending: 0, done: 0, overdue: 0, skipped: 0 };
  linhas.forEach((linha) => {
    porStatus[linha._id] = linha.total;
  });

  const occurrences = porStatus.pending + porStatus.done + porStatus.overdue + porStatus.skipped;

  return Object.assign({ occurrences }, porStatus);
}

async function occurrenceTotalsByTask(householdId, from, to) {
  return TaskOccurrence.aggregate([
    { $match: { household: householdId, dueDate: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$task',
        occurrences: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
      },
    },
    { $lookup: { from: 'tasks', localField: '_id', foreignField: '_id', as: 'task' } },
    { $unwind: '$task' },
    {
      $project: {
        _id: 0,
        taskId: '$_id',
        name: '$task.name',
        occurrences: 1,
        completed: 1,
        overdue: 1,
      },
    },
  ]);
}

// Ocorrencias vencidas/puladas por RESPONSAVEL (eixo diferente do de pontos).
async function occurrenceTroubleByAssignee(householdId, from, to) {
  const linhas = await TaskOccurrence.aggregate([
    {
      $match: {
        household: householdId,
        dueDate: { $gte: from, $lte: to },
        assignedTo: { $ne: null },
        status: { $in: ['overdue', 'skipped'] },
      },
    },
    { $group: { _id: { user: '$assignedTo', status: '$status' }, total: { $sum: 1 } } },
  ]);

  const porUsuario = {};

  linhas.forEach((linha) => {
    const chave = String(linha._id.user);
    porUsuario[chave] = porUsuario[chave] || { overdue: 0, skipped: 0 };
    porUsuario[chave][linha._id.status] = linha.total;
  });

  return porUsuario;
}

// @desc  Relatorio completo da casa.
async function householdStats(household, options) {
  const janela = await resolveWindow(household, options);
  const householdId = toObjectId(household._id);
  const timezone = zoneOf(household.timezone);

  const [ocorrencias, execucoes, porTarefa, problemas, membros] = await Promise.all([
    occurrenceTotalsByStatus(householdId, janela.from, janela.to),
    executionTotals(householdId, janela.from, janela.to, timezone),
    occurrenceTotalsByTask(householdId, janela.from, janela.to),
    occurrenceTroubleByAssignee(householdId, janela.from, janela.to),
    Membership.find({ household: household._id }).populate('user', 'name username').sort({
      joinedAt: 1,
    }),
  ]);

  const porMembro = execucoes.byMember;
  const atrasoPorTarefa = execucoes.byTask;

  const atrasoDe = {};
  let delaySumTotal = 0;
  let delayCountTotal = 0;

  porMembro.forEach((linha) => {
    delaySumTotal += linha.delaySum;
    delayCountTotal += linha.delayCount;
  });

  atrasoPorTarefa.forEach((linha) => {
    atrasoDe[String(linha._id)] = linha.delayCount
      ? round(linha.delaySum / linha.delayCount, 2)
      : 0;
  });

  const executores = {};
  porMembro.forEach((linha) => {
    executores[String(linha._id)] = linha;
  });

  const onTimeTotal = porMembro.reduce((soma, linha) => soma + linha.onTime, 0);
  const completedTotal = porMembro.reduce((soma, linha) => soma + linha.completed, 0);

  return {
    householdId: String(household._id),
    from: janela.from,
    to: janela.to,
    totals: {
      occurrences: ocorrencias.occurrences,
      completed: ocorrencias.done,
      overdue: ocorrencias.overdue,
      skipped: ocorrencias.skipped,
      completionRate: rate(ocorrencias.done, ocorrencias.occurrences),
      onTimeRate: rate(onTimeTotal, completedTotal),
      avgCompletionDelayHours: delayCountTotal ? round(delaySumTotal / delayCountTotal, 2) : 0,
    },
    // Todos os membros aparecem, inclusive os sem atividade: um ranking que esconde
    // quem nao fez nada esconde justamente a informacao que interessa.
    byMember: membros
      .filter((membership) => membership.user)
      .map((membership) => {
        const userId = String(membership.user._id);
        const execucao = executores[userId];
        const problemasDoMembro = problemas[userId] || { overdue: 0, skipped: 0 };

        return {
          user: {
            id: userId,
            name: membership.user.name,
            username: membership.user.username,
          },
          points: execucao ? execucao.points : 0,
          completed: execucao ? execucao.completed : 0,
          overdue: problemasDoMembro.overdue,
          skipped: problemasDoMembro.skipped,
          onTimeRate: execucao ? rate(execucao.onTime, execucao.completed) : 0,
          avgRating: execucao && execucao.ratingCount
            ? round(execucao.ratingSum / execucao.ratingCount, 2)
            : null,
        };
      }),
    byTask: porTarefa
      .map((linha) => ({
        taskId: String(linha.taskId),
        name: linha.name,
        occurrences: linha.occurrences,
        completed: linha.completed,
        overdue: linha.overdue,
        avgCompletionDelayHours: atrasoDe[String(linha.taskId)] || 0,
      }))
      // Desempate por nome para a saida ser deterministica.
      .sort(
        (a, b) =>
          b.overdue - a.overdue || b.occurrences - a.occurrences || a.name.localeCompare(b.name)
      ),
  };
}

// Ranking a partir de um relatorio ja calculado: pontos desc, empate pela pontualidade.
// Existe separado para que o score de um membro nao recalcule as agregacoes.
function rankingFrom(report) {
  return report.byMember
    .slice()
    .sort((a, b) => b.points - a.points || b.onTimeRate - a.onTimeRate)
    .map((membro, indice) => ({
      position: indice + 1,
      user: membro.user,
      points: membro.points,
      completed: membro.completed,
      onTimeRate: membro.onTimeRate,
    }));
}

// @desc  Ranking da casa.
async function leaderboard(household, options) {
  const relatorio = await householdStats(household, options);

  return {
    period: options && options.period ? options.period : 'week',
    from: relatorio.from,
    to: relatorio.to,
    entries: rankingFrom(relatorio),
  };
}

// @desc  Posicao e pontuacao de um membro.
async function memberScore(household, userId, options) {
  const relatorio = await householdStats(household, options);
  const minha = rankingFrom(relatorio).find((entry) => entry.user.id === String(userId));

  return {
    householdId: String(household._id),
    user: minha ? minha.user : null,
    period: options && options.period ? options.period : 'month',
    points: minha ? minha.points : 0,
    completed: minha ? minha.completed : 0,
    position: minha ? minha.position : null,
    from: relatorio.from,
    to: relatorio.to,
  };
}

module.exports = {
  APPROVED,
  DEFAULT_STATS_DAYS,
  periodWindow,
  resolveWindow,
  householdStats,
  leaderboard,
  memberScore,
};
