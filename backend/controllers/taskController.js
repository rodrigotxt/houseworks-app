// controllers/taskController.js

const Task = require('../models/Task');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, noContent } = require('../utils/respond');

// Carrega a tarefa e garante que ela pertence ao usuario autenticado.
// ATENCAO: o criterio de posse ainda e createdBy (modelo user-centric do baseline).
// A Fase 1 troca isto por pertencimento a Household — ver docs/ROADMAP.md (P1/P6).
async function findOwnedTask(taskId, userId, action) {
  const task = await Task.findById(taskId);

  if (!task) {
    throw ApiError.notFound('Tarefa nao encontrada.', ErrorCode.TASK_NOT_FOUND);
  }

  if (task.createdBy.toString() !== userId) {
    throw ApiError.forbidden('Nao autorizado a ' + action + ' esta tarefa.');
  }

  return task;
}

// @desc    Criar uma nova tarefa
// @route   POST /api/v1/tasks
// @access  Privado
exports.createTask = async (req, res) => {
  const { name, frequency, difficulty } = req.body;

  const task = await new Task({
    name,
    frequency,
    difficulty,
    createdBy: req.user.id,
  }).save();

  return created(res, task);
};

// @desc    Obter todas as tarefas do usuario logado
// @route   GET /api/v1/tasks
// @access  Privado
exports.getAllTasks = async (req, res) => {
  const tasks = await Task.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  return ok(res, tasks);
};

// @desc    Obter uma tarefa especifica por ID
// @route   GET /api/v1/tasks/:id
// @access  Privado
exports.getTaskById = async (req, res) => {
  const task = await findOwnedTask(req.params.id, req.user.id, 'acessar');
  return ok(res, task);
};

// @desc    Atualizar uma tarefa
// @route   PUT /api/v1/tasks/:id
// @access  Privado
exports.updateTask = async (req, res) => {
  const task = await findOwnedTask(req.params.id, req.user.id, 'atualizar');

  // Apenas campos do contrato. nextDueDate/lastCompletedDate sao derivados e nao
  // sao aceitos na entrada (o schema de validacao tambem os rejeita).
  const { name, frequency, difficulty, status } = req.body;

  if (name !== undefined) task.name = name;
  if (frequency !== undefined) task.frequency = frequency;
  if (difficulty !== undefined) task.difficulty = difficulty;
  if (status !== undefined) task.status = status;

  await task.save();

  return ok(res, task);
};

// @desc    Deletar uma tarefa
// @route   DELETE /api/v1/tasks/:id
// @access  Privado
exports.deleteTask = async (req, res) => {
  const task = await findOwnedTask(req.params.id, req.user.id, 'deletar');

  await Task.deleteOne({ _id: task._id });

  return noContent(res);
};

module.exports.findOwnedTask = findOwnedTask;
