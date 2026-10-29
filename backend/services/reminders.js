// services/reminders.js
// O motor dos lembretes: materializar disparos, despachar e entregar.
//
// Duas garantias, no mesmo espirito das ocorrencias:
//
//   1. IDEMPOTENCIA — o indice unico {reminder, fireAt, user} garante um disparo por
//      instante, mesmo com o job rodando duas vezes. Nao ha checagem em memoria.
//   2. JANELA — lembrete nao e obrigacao: um aviso das 21h entregue as 9h do dia
//      seguinte e pior que nenhum. Disparos atrasados mais de MISSED_AFTER_MS viram
//      "missed" em vez de chegar fora de hora. E por isso que, ao contrario das
//      ocorrencias, aqui NAO existe backfill do passado.
//
// O lembrete e materializado com horizonte curto (7 dias) porque a unica coisa que se
// ganha com mais e antecipar um disparo que ainda vai ser recalculado.

const { DateTime } = require('luxon');

const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Reminder = require('../models/Reminder');
const ReminderFiring = require('../models/ReminderFiring');
const ReminderDelivery = require('../models/ReminderDelivery');
const TaskOccurrence = require('../models/TaskOccurrence');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { expandDueDates } = require('./recurrence');
const { todayInZone, addDays, zoneOf } = require('./time');
const { sendThroughChannels } = require('./channels');

// Quantos dias de disparos materializar a frente.
const HORIZON_DAYS = 7;

// Ate quando um disparo atrasado ainda vale a pena. Passou disso, e "missed".
const MISSED_AFTER_MS = 10 * 60 * 1000;

// Tolerancia para gerar o disparo do minuto corrente: sem ela, um job que roda as
// 21:00:05 nunca materializaria o disparo das 21:00.
const GENERATION_GRACE_MS = 60 * 1000;

const DISPATCH_BATCH = 100;

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

function startOfMinute(date) {
  return new Date(Math.floor(date.getTime() / 60000) * 60000);
}

// Instante absoluto de uma data+hora LOCAIS da casa. O fuso entra aqui e so aqui.
function fireAtFor(localDate, time, timezone) {
  const moment = DateTime.fromISO(localDate + 'T' + time, { zone: zoneOf(timezone) });

  if (!moment.isValid) return null;

  return moment.toJSDate();
}

function localStamp(instant, timezone) {
  const moment = DateTime.fromJSDate(instant).setZone(zoneOf(timezone));

  return { localDate: moment.toISODate(), localTime: moment.toFormat('HH:mm') };
}

// Materializa os proximos disparos de UM lembrete, ate o horizonte.
async function materializeForReminder(reminder, options) {
  const settings = options || {};

  if (reminder.status !== 'active') return 0;

  const now = settings.now || new Date();
  const timezone = settings.timezone;
  const horizonDays = settings.horizonDays || HORIZON_DAYS;

  const today = todayInZone(timezone, now);
  const horizon = addDays(today, horizonDays);

  // Nunca retrocede: um lembrete diario criado ha um ano nao materializa um ano de
  // avisos que ninguem recebeu.
  const from = reminder.firingsGeneratedUntil
    ? addDays(reminder.firingsGeneratedUntil, 1)
    : today;
  const start = from > today ? from : today;

  if (start > horizon) return 0;

  const dates = expandDueDates(reminder.schedule, { from: start, to: horizon });

  const earliest = now.getTime() - GENERATION_GRACE_MS;
  // Um lembrete criado DEPOIS da hora de hoje nao dispara hoje: "tomar remedio as
  // 21h" criado as 22h comeca amanha. Sem isto, criar um lembrete dispararia um push
  // imediato com a hora errada.
  const createdMinute = reminder.createdAt ? startOfMinute(reminder.createdAt).getTime() : 0;

  const documents = [];

  for (const localDate of dates) {
    const fireAt = fireAtFor(localDate, reminder.schedule.time, timezone);

    if (!fireAt) continue;

    const instant = fireAt.getTime();
    if (instant < earliest) continue;
    if (instant < createdMinute) continue;

    documents.push({
      reminder: reminder._id,
      household: reminder.household,
      fireAt,
      localDate,
      localTime: reminder.schedule.time,
      kind: 'schedule',
      status: 'scheduled',
    });
  }

  let createdCount = 0;

  if (documents.length > 0) {
    try {
      const inserted = await ReminderFiring.insertMany(documents, { ordered: false });
      createdCount = inserted.length;
    } catch (error) {
      if (!isDuplicateOnly(error)) throw error;
      // ordered:false insere o que nao conflita; as duplicatas sao a idempotencia.
      createdCount = Array.isArray(error.insertedDocs) ? error.insertedDocs.length : 0;
    }
  }

  reminder.firingsGeneratedUntil = horizon;
  await reminder.save();

  return createdCount;
}

// Materializa os lembretes ativos de uma casa. Chamado na criacao, na edicao e no job.
async function refreshHousehold(household, options) {
  const settings = options || {};
  const reminders = await Reminder.find({ household: household._id, status: 'active' });

  let created = 0;
  for (const reminder of reminders) {
    created += await materializeForReminder(reminder, {
      now: settings.now,
      timezone: household.timezone,
    });
  }

  return created;
}

// Cancela os disparos futuros e recua o marcador para ontem.
//
// E o equivalente de resetFutureOccurrences: mudar a regra nao reescreve o passado.
// O que ja foi entregue (ReminderDelivery) fica; o que ainda ia tocar, nao toca mais.
async function resetFutureFirings(reminder, options) {
  const settings = options || {};
  const now = settings.now || new Date();

  await ReminderFiring.deleteMany({ reminder: reminder._id, status: 'scheduled' });

  reminder.firingsGeneratedUntil = addDays(todayInZone(settings.timezone, now), -1);
  await reminder.save();
}

async function resolveRecipients(reminder) {
  if (reminder.allMembers) {
    const memberships = await Membership.find({ household: reminder.household }).select('user');
    return memberships.map((membership) => membership.user);
  }

  return reminder.recipients || [];
}

function isRecipient(reminder, userId) {
  if (reminder.allMembers) return true;

  return (reminder.recipients || []).some((recipient) => String(recipient) === String(userId));
}

async function upsertDelivery(firing, reminder, userId) {
  try {
    return await ReminderDelivery.findOneAndUpdate(
      { firing: firing._id, user: userId },
      {
        $setOnInsert: {
          reminder: reminder._id,
          household: reminder.household,
          channels: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (!isDuplicateOnly(error)) throw error;
    return ReminderDelivery.findOne({ firing: firing._id, user: userId });
  }
}

async function archiveIfSingleShot(reminder, now) {
  if (reminder.schedule.frequency === 'ocasional' && reminder.status === 'active') {
    reminder.status = 'archived';
    reminder.archivedAt = now;
    await reminder.save();
  }
}

async function markFiring(firing, status, reason, now) {
  firing.status = status;
  firing.reason = reason || null;
  if (status === 'delivered') firing.deliveredAt = now;
  await firing.save();
}

// Entrega UM disparo: resolve destinatarios, checa a tarefa vinculada e executa os
// canais de cada pessoa.
async function deliverFiring(firing, options) {
  const settings = options || {};
  const now = settings.now || new Date();

  const reminder = await Reminder.findById(firing.reminder);

  if (!reminder) {
    await markFiring(firing, 'cancelled', 'lembrete_removido', now);
    return 'cancelled';
  }

  const isSnooze = firing.kind === 'snooze';

  // Um adiamento pedido pela pessoa continua valendo mesmo se o lembrete foi
  // arquivado depois: ela pediu para ser avisada, e o aviso e ela mesma.
  if (!isSnooze && reminder.status !== 'active') {
    await markFiring(firing, 'cancelled', 'lembrete_inativo', now);
    return 'cancelled';
  }

  const recipients = isSnooze
    ? firing.user
      ? [firing.user]
      : []
    : await resolveRecipients(reminder);

  if (recipients.length === 0) {
    await markFiring(firing, 'skipped', 'sem_destinatarios', now);
    await archiveIfSingleShot(reminder, now);
    return 'skipped';
  }

  // Lembrete vinculado a uma tarefa: se a ocorrencia daquele dia ja foi feita (ou
  // pulada), o aviso nao sai. E o caso "conferir se a tarefa ja foi concluida" — o
  // sistema confere, e so incomoda quando ainda falta.
  if (reminder.task && reminder.skipIfTaskDone) {
    const occurrence = await TaskOccurrence.findOne({
      household: reminder.household,
      task: reminder.task,
      dueDate: firing.localDate,
    });

    if (occurrence && (occurrence.status === 'done' || occurrence.status === 'skipped')) {
      await markFiring(firing, 'skipped', 'tarefa_concluida', now);
      await archiveIfSingleShot(reminder, now);
      return 'skipped';
    }
  }

  const channels = reminder.channels && reminder.channels.length ? reminder.channels : ['in_app'];

  for (const userId of recipients) {
    const delivery = await upsertDelivery(firing, reminder, userId);
    const results = await sendThroughChannels(channels, { reminder, delivery, userId });

    delivery.channels = results;
    await delivery.save();
  }

  await markFiring(firing, 'delivered', null, now);
  await archiveIfSingleShot(reminder, now);

  return 'delivered';
}

// Despacha tudo que venceu dentro da janela.
async function dispatchDue(options) {
  const settings = options || {};
  const now = settings.now || new Date();
  const cutoff = new Date(now.getTime() - MISSED_AFTER_MS);

  const expired = await ReminderFiring.updateMany(
    { status: 'scheduled', fireAt: { $lt: cutoff } },
    { $set: { status: 'missed', reason: 'janela_expirada' } }
  );

  const due = await ReminderFiring.find({
    status: 'scheduled',
    fireAt: { $gte: cutoff, $lte: now },
  })
    .sort({ fireAt: 1 })
    .limit(settings.limit || DISPATCH_BATCH);

  const summary = {
    delivered: 0,
    skipped: 0,
    cancelled: 0,
    missed: expired.modifiedCount || 0,
    failures: 0,
  };

  for (const candidate of due) {
    // Lock: somente UM despachante consegue levar o disparo de scheduled para
    // processing. Com duas replicas, a segunda nao encontra mais nada.
    const firing = await ReminderFiring.findOneAndUpdate(
      { _id: candidate._id, status: 'scheduled' },
      { $set: { status: 'processing' } },
      { new: true }
    );

    if (!firing) continue;

    try {
      const outcome = await deliverFiring(firing, { now });
      summary[outcome] += 1;
    } catch (error) {
      summary.failures += 1;
      await ReminderFiring.updateOne(
        { _id: firing._id },
        { $set: { status: 'skipped', reason: 'erro_no_disparo' } }
      );
      // Um lembrete que nao sai precisa deixar rastro no log, nao sumir.
      console.error('[reminders] falha ao disparar ' + firing._id + ':', error);
    }
  }

  return summary;
}

// Job de cada minuto: materializa e despacha.
async function runReminderJob(options) {
  const settings = options || {};
  const households = await Household.find();

  let materialized = 0;
  for (const household of households) {
    materialized += await refreshHousehold(household, settings);
  }

  const summary = await dispatchDue(settings);

  return Object.assign(
    { households: households.length, materialized },
    summary
  );
}

// ---- acoes do usuario -------------------------------------------------------

async function acknowledge(reminder, userId, options) {
  const settings = options || {};
  const now = settings.now || new Date();

  const delivery = await ReminderDelivery.findOne({
    reminder: reminder._id,
    user: userId,
  }).sort({ createdAt: -1 });

  if (!delivery) {
    throw ApiError.notFound(
      'Nenhuma notificacao deste lembrete para voce.',
      ErrorCode.DELIVERY_NOT_FOUND
    );
  }

  if (!delivery.readAt) delivery.readAt = now;
  if (!delivery.acknowledgedAt) delivery.acknowledgedAt = now;

  await delivery.save();
  return delivery;
}

async function snooze(reminder, userId, minutes, options) {
  const settings = options || {};
  const now = settings.now || new Date();
  const fireAt = new Date(now.getTime() + minutes * 60000);
  const stamp = localStamp(fireAt, settings.timezone);

  try {
    return await ReminderFiring.create({
      reminder: reminder._id,
      household: reminder.household,
      fireAt,
      localDate: stamp.localDate,
      localTime: stamp.localTime,
      kind: 'snooze',
      user: userId,
      status: 'scheduled',
    });
  } catch (error) {
    if (!isDuplicateOnly(error)) throw error;

    const existing = await ReminderFiring.findOne({
      reminder: reminder._id,
      fireAt,
      user: userId,
    });

    return existing;
  }
}

// ---- consultas de leitura ---------------------------------------------------

async function nextFireAtFor(reminderId) {
  const firing = await ReminderFiring.findOne({
    reminder: reminderId,
    status: 'scheduled',
  }).sort({ fireAt: 1 });

  return firing ? firing.fireAt : null;
}

async function nextFireAtMap(reminderIds) {
  const rows = await ReminderFiring.aggregate([
    { $match: { reminder: { $in: reminderIds }, status: 'scheduled' } },
    { $group: { _id: '$reminder', next: { $min: '$fireAt' } } },
  ]);

  const map = new Map();
  rows.forEach((row) => map.set(String(row._id), row.next));
  return map;
}

module.exports = {
  HORIZON_DAYS,
  MISSED_AFTER_MS,
  fireAtFor,
  localStamp,
  materializeForReminder,
  refreshHousehold,
  resetFutureFirings,
  resolveRecipients,
  isRecipient,
  deliverFiring,
  dispatchDue,
  runReminderJob,
  acknowledge,
  snooze,
  nextFireAtFor,
  nextFireAtMap,
};
