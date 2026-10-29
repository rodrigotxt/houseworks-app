// routes/reminder.js
// Lembrete por id. Sem householdId na rota: o escopo vem do proprio recurso
// (middlewares/reminder.js resolve a membership a partir da casa do lembrete).

const express = require('express');
const router = express.Router();

const reminderController = require('../controllers/reminderController');
const { requireAuth } = require('../middlewares/auth');
const { loadReminder } = require('../middlewares/reminder');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const {
  updateReminderSchema,
  snoozeReminderSchema,
} = require('../schemas/reminder');

// @route   GET /reminders/:reminderId
// @desc    Detalhe do lembrete (com o proximo disparo e a minha ultima notificacao)
// @access  Membro da casa do lembrete
router.get('/:reminderId', requireAuth, loadReminder, asyncHandler(reminderController.getById));

// @route   PATCH /reminders/:reminderId
// @desc    Atualizar lembrete
// @access  adulto/owner para qualquer; crianca apenas o proprio
router.patch(
  '/:reminderId',
  requireAuth,
  loadReminder,
  validate({ body: updateReminderSchema }),
  asyncHandler(reminderController.update)
);

// @route   DELETE /reminders/:reminderId
// @desc    Arquivar (padrao) ou excluir (?hard=true, apenas owner)
// @access  adulto/owner para qualquer; crianca apenas o proprio
router.delete('/:reminderId', requireAuth, loadReminder, asyncHandler(reminderController.remove));

// @route   POST /reminders/:reminderId/ack
// @desc    Marcar como feito para mim
// @access  Destinatario
router.post(
  '/:reminderId/ack',
  requireAuth,
  loadReminder,
  asyncHandler(reminderController.acknowledge)
);

// @route   POST /reminders/:reminderId/snooze
// @desc    Adiar por N minutos para mim
// @access  Destinatario
router.post(
  '/:reminderId/snooze',
  requireAuth,
  loadReminder,
  validate({ body: snoozeReminderSchema }),
  asyncHandler(reminderController.snooze)
);

module.exports = router;
