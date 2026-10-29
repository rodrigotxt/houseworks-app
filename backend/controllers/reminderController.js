// controllers/reminderController.js
// Lembretes da casa. As rotas aninhadas chegam com req.household (requireMember);
// as rotas /reminders/:reminderId chegam com req.reminder, req.membership e
// req.household (loadReminder).
//
// REGRAS DE QUEM PODE O QUE:
//   - owner/adult (capability canManageReminders): criam e editam para QUALQUER membro,
//     inclusive "todos";
//   - crianca: cria e edita apenas os PROPRIOS lembretes, e apenas para si mesma;
//   - todos os membros leem os lembretes da casa, mas a crianca so ve os que criou ou
//     que recebe (um lembrete pessoal nao vira mural da casa);
//   - "feito" e "adiar" sao de quem RECEBE, nao de quem criou.
//
// Nada aqui concede permissao por createdBy: a visibilidade e a casa; o createdBy so
// limita a crianca, que nao tem a capacidade de administrar os lembretes dos outros.

const Reminder = require('../models/Reminder');
const ReminderDelivery = require('../models/ReminderDelivery');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, noContent, pageMeta } = require('../utils/respond');
const { buildSort, skipFor, escapeRegex } = require('../utils/pagination');
const { resolveCapabilities } = require('../utils/capabilities');
const { isAvailable } = require('../services/channels');
const remindersService = require('../services/reminders');

const REMINDER_SORT_FIELDS = ['title', 'createdAt', 'updatedAt'];

// O contrato define createdBy e recipients como UserRef (objeto), nao como id solto.
const REMINDER_POPULATE = [
  { path: 'createdBy', select: 'name username' },
  { path: 'recipients', select: 'name username' },
  { path: 'task', select: 'name status' },
];

const DELIVERY_POPULATE = {
  path: 'reminder',
  select: 'title notes schedule channels status',
};

function canManageReminders(membership) {
  const capabilities = resolveCapabilities(membership.role, membership.overrides);
  return capabilities.canManageReminders === true;
}

// Devolve true quando o usuario administra lembretes (adulto/owner). Quando nao
// administra, so pode seguir se o lembrete for dele; senao, 403.
function assertCanEdit(req, reminder) {
  const manage = canManageReminders(req.membership);

  if (manage) return manage;

  if (String(reminder.createdBy) === req.userId) {
    return manage;
  }

  throw ApiError.forbidden(
    'Seu papel nesta casa nao permite mexer nos lembretes de outra pessoa.',
    ErrorCode.INSUFFICIENT_ROLE
  );
}

function assertChannels(channels) {
  const unavailable = channels.filter((channel) => !isAvailable(channel));

  if (unavailable.length > 0) {
    throw new ApiError(
      400,
      ErrorCode.CHANNEL_NOT_AVAILABLE,
      'Um ou mais canais nao estao disponiveis nesta instalacao.',
      unavailable.map((channel) => ({
        field: 'channels',
        issue: 'Canal indisponivel: ' + channel + '.',
      }))
    );
  }
}

function uniqueIds(ids) {
  const unique = [];

  ids.forEach((id) => {
    const text = String(id);
    if (unique.indexOf(text) === -1) unique.push(text);
  });

  return unique;
}

// Todo destinatario precisa ser membro da casa: sem isso o lembrete iria para alguem
// que nem enxerga a casa.
async function assertRecipients(householdId, recipients) {
  const unique = uniqueIds(recipients);

  const count = await Membership.countDocuments({
    household: householdId,
    user: { $in: unique },
  });

  if (count !== unique.length) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      { field: 'recipients', issue: 'Todo destinatario precisa ser membro desta casa.' },
    ]);
  }

  return unique;
}

async function assertTask(householdId, taskId) {
  if (!taskId) return null;

  const task = await Task.findOne({ _id: taskId, household: householdId }).select('_id');

  if (!task) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      { field: 'task', issue: 'A tarefa vinculada precisa ser desta casa.' },
    ]);
  }

  return task._id;
}

function toView(reminder, nextFireAt) {
  const view = reminder.toJSON();

  // A tarefa vinculada vira uma referencia curta: a tela so precisa de nome e status.
  if (view.task && typeof view.task === 'object') {
    view.task = { id: view.task.id, name: view.task.name, status: view.task.status };
  }

  view.nextFireAt = nextFireAt ? new Date(nextFireAt).toISOString() : null;

  return view;
}

async function latestDeliveryFor(reminderId, userId) {
  return ReminderDelivery.findOne({ reminder: reminderId, user: userId })
    .sort({ createdAt: -1 })
    .populate(DELIVERY_POPULATE);
}

// @desc    Criar lembrete na casa
// @route   POST /api/v1/households/:householdId/reminders
// @access  Membro; crianca apenas para si
exports.create = async (req, res) => {
  const body = req.body;
  const manage = canManageReminders(req.membership);

  let allMembers = body.allMembers === true;
  let recipients = body.recipients || [];

  if (!manage) {
    // Crianca: so para si, nunca para outro e nunca para "todos".
    const onlySelf =
      !allMembers && recipients.every((id) => String(id) === req.userId);

    if (!onlySelf) {
      throw ApiError.forbidden(
        'Seu papel nesta casa so permite criar lembrete para voce mesma.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }

    recipients = [req.userId];
    allMembers = false;
  } else if (!allMembers && recipients.length === 0) {
    // Sem destinatario informado, o lembrete e para quem cria.
    recipients = [req.userId];
  }

  const channels = body.channels || ['in_app'];
  assertChannels(channels);

  const storedRecipients = allMembers
    ? []
    : await assertRecipients(req.household._id, recipients);

  const task = await assertTask(req.household._id, body.task || null);

  const reminder = await new Reminder({
    household: req.household._id,
    title: body.title,
    notes: body.notes,
    createdBy: req.userId,
    schedule: body.schedule,
    recipients: storedRecipients,
    allMembers,
    channels,
    task,
    skipIfTaskDone: body.skipIfTaskDone === undefined ? true : body.skipIfTaskDone,
  }).save();

  // Materializa ja na criacao: a tela mostra o proximo disparo sem esperar o job.
  await remindersService.materializeForReminder(reminder, {
    timezone: req.household.timezone,
  });

  await reminder.populate(REMINDER_POPULATE);

  const nextFireAt = await remindersService.nextFireAtFor(reminder._id);
  const view = toView(reminder, nextFireAt);
  const delivery = await latestDeliveryFor(reminder._id, req.userId);

  view.myDelivery = delivery ? delivery.toJSON() : null;

  return created(res, view);
};

// @desc    Listar lembretes da casa
// @route   GET /api/v1/households/:householdId/reminders
// @access  Membro; crianca ve apenas o que criou ou recebe
exports.list = async (req, res) => {
  const { status, recipient, task, q, sort, page, pageSize } = req.validatedQuery;

  // A leitura materializa (como a agenda faz com as ocorrencias): se o job ficou
  // parado, o proximo disparo continua existindo. O job segue sendo quem DESPACHA.
  await remindersService.refreshHousehold(req.household);

  const conditions = [{ household: req.household._id }];

  if (status === 'all') {
    // sem filtro de status
  } else if (status) {
    conditions.push({ status });
  } else {
    conditions.push({ status: 'active' });
  }

  if (!canManageReminders(req.membership)) {
    conditions.push({
      $or: [{ createdBy: req.userId }, { recipients: req.userId }, { allMembers: true }],
    });
  }

  if (recipient) {
    const target = recipient === 'me' ? req.userId : recipient;
    conditions.push({ $or: [{ recipients: target }, { allMembers: true }] });
  }

  if (task) conditions.push({ task });
  if (q) conditions.push({ title: { $regex: escapeRegex(q), $options: 'i' } });

  const filter = { $and: conditions };
  const sortSpec = buildSort(sort, REMINDER_SORT_FIELDS, '-createdAt');

  const [items, total] = await Promise.all([
    Reminder.find(filter)
      .populate(REMINDER_POPULATE)
      .sort(sortSpec)
      .skip(skipFor(page, pageSize))
      .limit(pageSize),
    Reminder.countDocuments(filter),
  ]);

  const nextMap = await remindersService.nextFireAtMap(items.map((item) => item._id));

  const data = items.map((item) =>
    toView(item, nextMap.get(String(item._id)))
  );

  return ok(res, data, pageMeta(page, pageSize, total));
};

// @desc    Detalhe do lembrete
// @route   GET /api/v1/reminders/:reminderId
// @access  Membro da casa do lembrete
exports.getById = async (req, res) => {
  await req.reminder.populate(REMINDER_POPULATE);

  const nextFireAt = await remindersService.nextFireAtFor(req.reminder._id);
  const view = toView(req.reminder, nextFireAt);
  const delivery = await latestDeliveryFor(req.reminder._id, req.userId);

  view.myDelivery = delivery ? delivery.toJSON() : null;

  return ok(res, view);
};

// @desc    Atualizar lembrete
// @route   PATCH /api/v1/reminders/:reminderId
// @access  adulto/owner para qualquer; crianca apenas o proprio
exports.update = async (req, res) => {
  const reminder = req.reminder;
  const body = req.body;
  const manage = assertCanEdit(req, reminder);

  const nextAllMembers =
    body.allMembers !== undefined ? body.allMembers : reminder.allMembers;

  let nextRecipients =
    body.recipients !== undefined
      ? body.recipients
      : reminder.recipients.map((id) => String(id));

  if (!manage) {
    if (nextAllMembers) {
      throw ApiError.forbidden(
        'Seu papel nesta casa nao permite criar lembrete para todos.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }

    if (nextRecipients.some((id) => String(id) !== req.userId)) {
      throw ApiError.forbidden(
        'Seu papel nesta casa so permite lembrete para voce mesma.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }

    nextRecipients = [req.userId];
  }

  if (nextAllMembers && nextRecipients.length > 0) {
    // Se o corpo pediu explicitamente os dois, e erro do cliente.
    if (body.allMembers === true && body.recipients && body.recipients.length > 0) {
      throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
        { field: 'recipients', issue: 'Com allMembers, nao envie destinatarios.' },
      ]);
    }
    nextRecipients = [];
  }

  // Desligar allMembers sem dizer quem recebe deixaria o lembrete sem ninguem.
  if (!nextAllMembers && nextRecipients.length === 0) {
    throw ApiError.badRequest('Um ou mais campos sao invalidos.', [
      { field: 'recipients', issue: 'Informe ao menos um destinatario.' },
    ]);
  }

  if (body.title !== undefined) reminder.title = body.title;
  if (body.notes !== undefined) reminder.notes = body.notes;
  if (body.schedule !== undefined) reminder.schedule = body.schedule;

  reminder.allMembers = nextAllMembers;
  reminder.recipients = nextAllMembers
    ? []
    : await assertRecipients(req.household._id, nextRecipients);

  if (body.channels !== undefined) {
    assertChannels(body.channels);
    reminder.channels = body.channels;
  }

  if (body.task !== undefined) {
    reminder.task = await assertTask(req.household._id, body.task);
  }

  if (body.skipIfTaskDone !== undefined) {
    reminder.skipIfTaskDone = body.skipIfTaskDone;
  }

  if (body.status !== undefined) {
    reminder.status = body.status;
    reminder.archivedAt =
      body.status === 'archived' ? reminder.archivedAt || new Date() : null;
  }

  await reminder.save();

  // Qualquer mudanca que afete a entrega vale do PROXIMO disparo em diante. O que ja
  // foi entregue fica no historico; o que ainda ia tocar e recalculado.
  await remindersService.resetFutureFirings(reminder, {
    timezone: req.household.timezone,
  });

  if (reminder.status === 'active') {
    await remindersService.materializeForReminder(reminder, {
      timezone: req.household.timezone,
    });
  }

  await reminder.populate(REMINDER_POPULATE);

  const nextFireAt = await remindersService.nextFireAtFor(reminder._id);
  const view = toView(reminder, nextFireAt);
  const delivery = await latestDeliveryFor(reminder._id, req.userId);

  view.myDelivery = delivery ? delivery.toJSON() : null;

  return ok(res, view);
};

// @desc    Arquivar (padrao) ou excluir definitivamente (?hard=true) o lembrete
// @route   DELETE /api/v1/reminders/:reminderId
// @access  adulto/owner para qualquer; crianca apenas o proprio; hard so owner
exports.remove = async (req, res) => {
  const reminder = req.reminder;
  assertCanEdit(req, reminder);

  if (req.query.hard === 'true') {
    if (req.membership.role !== 'owner') {
      throw ApiError.forbidden(
        'Apenas o owner pode excluir um lembrete definitivamente.',
        ErrorCode.INSUFFICIENT_ROLE
      );
    }

    await ReminderDelivery.deleteMany({ reminder: reminder._id });
    await require('../models/ReminderFiring').deleteMany({ reminder: reminder._id });
    await Reminder.deleteOne({ _id: reminder._id });

    return noContent(res);
  }

  // Idempotente, como o arquivamento de tarefa.
  if (reminder.status !== 'archived') {
    reminder.status = 'archived';
    reminder.archivedAt = new Date();
    await reminder.save();

    await remindersService.resetFutureFirings(reminder, {
      timezone: req.household.timezone,
    });
  }

  return noContent(res);
};

// @desc    Marcar como feito (a ultima notificacao deste lembrete para mim)
// @route   POST /api/v1/reminders/:reminderId/ack
// @access  Destinatario do lembrete
exports.acknowledge = async (req, res) => {
  if (!remindersService.isRecipient(req.reminder, req.userId)) {
    throw ApiError.forbidden(
      'Este lembrete nao e destinado a voce.',
      ErrorCode.REMINDER_NOT_ASSIGNED_TO_YOU
    );
  }

  const delivery = await remindersService.acknowledge(req.reminder, req.userId);

  const populated = await ReminderDelivery.findById(delivery._id).populate(
    DELIVERY_POPULATE
  );

  return ok(res, populated);
};

// @desc    Adiar o lembrete por N minutos (para mim)
// @route   POST /api/v1/reminders/:reminderId/snooze
// @access  Destinatario do lembrete
exports.snooze = async (req, res) => {
  if (!remindersService.isRecipient(req.reminder, req.userId)) {
    throw ApiError.forbidden(
      'Este lembrete nao e destinado a voce.',
      ErrorCode.REMINDER_NOT_ASSIGNED_TO_YOU
    );
  }

  const firing = await remindersService.snooze(
    req.reminder,
    req.userId,
    req.body.minutes,
    { timezone: req.household.timezone }
  );

  // Adiar tambem e uma leitura: o aviso saiu da lista de novos.
  const delivery = await ReminderDelivery.findOne({
    reminder: req.reminder._id,
    user: req.userId,
  }).sort({ createdAt: -1 });

  if (delivery && !delivery.readAt) {
    delivery.readAt = new Date();
    await delivery.save();
  }

  return created(res, firing);
};
