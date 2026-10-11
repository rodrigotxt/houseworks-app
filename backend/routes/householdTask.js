// routes/householdTask.js
// Tarefas DENTRO de uma casa. Montado por routes/household.js em
// /households/:householdId/tasks — mergeParams deixa householdId visivel aqui.

const express = require('express');
const router = express.Router({ mergeParams: true });

const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middlewares/auth');
const { requireMember, authorize } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { createTaskSchema, listTasksQuerySchema } = require('../schemas/task');

// @route   GET /households/:householdId/tasks
// @desc    Tarefas da casa
// @access  Membro da casa
router.get(
  '/',
  requireAuth,
  requireMember,
  validate({ query: listTasksQuerySchema }),
  asyncHandler(taskController.list)
);

// @route   POST /households/:householdId/tasks
// @desc    Criar tarefa na casa
// @access  owner ou adult
router.post(
  '/',
  requireAuth,
  requireMember,
  authorize('canManageTasks'),
  validate({ body: createTaskSchema }),
  asyncHandler(taskController.create)
);

module.exports = router;
