// routes/householdReminder.js
// Lembretes DENTRO de uma casa. Montado por routes/household.js em
// /households/:householdId/reminders — mergeParams deixa householdId visivel aqui.
//
// Nao ha authorize('canManageReminders') na criacao: a crianca PODE criar (para si).
// Quem decide o alcance e o controller, que conhece a regra completa.

const express = require('express');
const router = express.Router({ mergeParams: true });

const reminderController = require('../controllers/reminderController');
const { requireAuth } = require('../middlewares/auth');
const { requireMember } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const {
  createReminderSchema,
  listRemindersQuerySchema,
} = require('../schemas/reminder');

// @route   GET /households/:householdId/reminders
// @desc    Lembretes da casa
// @access  Membro da casa
router.get(
  '/',
  requireAuth,
  requireMember,
  validate({ query: listRemindersQuerySchema }),
  asyncHandler(reminderController.list)
);

// @route   POST /households/:householdId/reminders
// @desc    Criar lembrete
// @access  Membro; crianca apenas para si
router.post(
  '/',
  requireAuth,
  requireMember,
  validate({ body: createReminderSchema }),
  asyncHandler(reminderController.create)
);

module.exports = router;
