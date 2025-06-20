// routes/task.js
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController'); // Importa o controlador de tarefas
const auth = require('../middlewares/auth'); // Importa o middleware de autenticação

// Rotas para Tarefas

// @route   POST /api/tasks
// @desc    Criar uma nova tarefa
// @access  Privado
router.post('/', auth, taskController.createTask);

// @route   GET /api/tasks
// @desc    Obter todas as tarefas do usuário logado
// @access  Privado
router.get('/', auth, taskController.getAllTasks);

// @route   GET /api/tasks/:id
// @desc    Obter uma tarefa específica por ID
// @access  Privado
router.get('/:id', auth, taskController.getTaskById);

// @route   PUT /api/tasks/:id
// @desc    Atualizar uma tarefa
// @access  Privado
router.put('/:id', auth, taskController.updateTask);

// @route   DELETE /api/tasks/:id
// @desc    Deletar uma tarefa
// @access  Privado
router.delete('/:id', auth, taskController.deleteTask);

module.exports = router;
