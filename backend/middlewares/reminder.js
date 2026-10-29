// middlewares/reminder.js
// Carrega o lembrete e resolve a membership a partir da CASA DO LEMBRETE.
//
// Mesmo padrao de middlewares/task.js: em rota por id de recurso, quem nao e membro
// da casa recebe 404, e nao 403 — assim nao vazamos a existencia de recursos de
// outras casas.

const Reminder = require('../models/Reminder');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');

async function loadReminder(req, res, next) {
  const reminder = await Reminder.findById(req.params.reminderId);

  if (!reminder) {
    throw ApiError.notFound('Lembrete nao encontrado.', ErrorCode.REMINDER_NOT_FOUND);
  }

  const membership = await Membership.findOne({
    household: reminder.household,
    user: req.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Lembrete nao encontrado.', ErrorCode.REMINDER_NOT_FOUND);
  }

  req.reminder = reminder;
  req.membership = membership;
  req.household = await Household.findById(reminder.household);

  return next();
}

module.exports = { loadReminder: asyncHandler(loadReminder) };
