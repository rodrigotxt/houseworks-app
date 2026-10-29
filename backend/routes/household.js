// routes/household.js
// Ordem importa: rotas literais (/join) antes das parametrizadas (/:householdId).

const express = require('express');
const router = express.Router();

const householdController = require('../controllers/householdController');
const householdTaskRoutes = require('./householdTask');
const householdReminderRoutes = require('./householdReminder');
const householdExecutionRoutes = require('./householdExecution');
const householdOccurrenceRoutes = require('./householdOccurrence');
const householdStatsRoutes = require('./householdStats');
const { requireAuth } = require('../middlewares/auth');
const { requireMember, requireRole } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const {
  createHouseholdSchema,
  updateHouseholdSchema,
  joinHouseholdSchema,
  updateMemberSchema,
  createMemberSchema,
} = require('../schemas/household');

// @route   POST /households/join
// @desc    Entrar em uma casa com codigo de convite
// @access  Privado
router.post('/join', requireAuth, validate({ body: joinHouseholdSchema }), asyncHandler(householdController.join));

// @route   GET /households
// @desc    Minhas casas
// @access  Privado
router.get('/', requireAuth, asyncHandler(householdController.listMine));

// @route   POST /households
// @desc    Criar casa
// @access  Privado
router.post('/', requireAuth, validate({ body: createHouseholdSchema }), asyncHandler(householdController.create));

// @route   GET /households/:householdId/invite
// @desc    Consultar codigo de convite
// @access  Owner ou adult
router.get(
  '/:householdId/invite',
  requireAuth,
  requireMember,
  requireRole('owner', 'adult'),
  asyncHandler(householdController.getInvite)
);

// @route   POST /households/:householdId/invite
// @desc    Rotacionar codigo de convite
// @access  Owner
router.post(
  '/:householdId/invite',
  requireAuth,
  requireMember,
  requireRole('owner'),
  asyncHandler(householdController.rotateInvite)
);

// @route   GET /households/:householdId/members
// @desc    Membros da casa
// @access  Membro da casa
router.get(
  '/:householdId/members',
  requireAuth,
  requireMember,
  asyncHandler(householdController.listMembers)
);

// @route   POST /households/:householdId/members
// @desc    Cadastrar uma pessoa nova na casa (cria usuario e membership)
// @access  Owner
router.post(
  '/:householdId/members',
  requireAuth,
  requireMember,
  requireRole('owner'),
  validate({ body: createMemberSchema }),
  asyncHandler(householdController.createMember)
);

// @route   PATCH /households/:householdId/members/:userId
// @desc    Alterar papel ou capacidades de um membro
// @access  Owner
router.patch(
  '/:householdId/members/:userId',
  requireAuth,
  requireMember,
  requireRole('owner'),
  validate({ body: updateMemberSchema }),
  asyncHandler(householdController.updateMember)
);

// @route   DELETE /households/:householdId/members/:userId
// @desc    Remover membro (ou sair da casa)
// @access  Membro da casa
router.delete(
  '/:householdId/members/:userId',
  requireAuth,
  requireMember,
  asyncHandler(householdController.removeMember)
);

// Rotas aninhadas: tarefas, execucoes e agenda da casa.
router.use('/:householdId/tasks', householdTaskRoutes);
router.use('/:householdId/reminders', householdReminderRoutes);
router.use('/:householdId/occurrences', householdOccurrenceRoutes);
router.use('/:householdId/executions', householdExecutionRoutes);

// Desempenho: /households/:householdId/stats e /leaderboard
router.use('/:householdId', householdStatsRoutes);

// @route   GET /households/:householdId
// @desc    Detalhe da casa
// @access  Membro da casa
router.get('/:householdId', requireAuth, requireMember, asyncHandler(householdController.get));

// @route   PATCH /households/:householdId
// @desc    Atualizar a casa
// @access  Owner
router.patch(
  '/:householdId',
  requireAuth,
  requireMember,
  requireRole('owner'),
  validate({ body: updateHouseholdSchema }),
  asyncHandler(householdController.update)
);

// @route   DELETE /households/:householdId
// @desc    Remover a casa
// @access  Owner
router.delete(
  '/:householdId',
  requireAuth,
  requireMember,
  requireRole('owner'),
  asyncHandler(householdController.remove)
);

module.exports = router;
