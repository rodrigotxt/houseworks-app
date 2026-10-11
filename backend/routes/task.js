// routes/task.js
const express = require('express');
const router = express.Router();

const taskController = require('../controllers/taskController');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { createTaskSchema, updateTaskSchema } = require('../schemas/task');

// @route   POST /tasks
// @desc    Criar uma nova tarefa
// @access  Privado
router.post('/', auth, validate({ body: createTaskSchema }), asyncHandler(taskController.createTask));

// @route   GET /tasks
// @desc    Obter todas as tarefas do usuario logado
// @access  Privado
router.get('/', auth, asyncHandler(taskController.getAllTasks));

// @route   GET /tasks/:id
// @desc    Obter uma tarefa especifica por ID
// @access  Privado
router.get('/:id', auth, asyncHandler(taskController.getTaskById));

// @route   PUT /tasks/:id
// @desc    Atualizar uma tarefa
// @access  Privado
router.put('/:id', auth, validate({ body: updateTaskSchema }), asyncHandler(taskController.updateTask));

// @route   DELETE /tasks/:id
// @desc    Deletar uma tarefa
// @access  Privado
router.delete('/:id', auth, asyncHandler(taskController.deleteTask));

module.exports = router;
