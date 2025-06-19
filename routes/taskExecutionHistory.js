// routes/taskExecutionHistory.js
const express = require('express');
const router = express.Router();
const taskExecutionHistoryController = require('../controllers/taskExecutionHistoryController');
const auth = require('../middlewares/auth'); // Importa o middleware de autenticação

// @route   POST /api/task-executions
// @desc    Registrar uma nova execução de tarefa (marcar como concluída)
// @access  Privado
router.post('/', auth, taskExecutionHistoryController.createTaskExecution);

// @route   GET /api/task-executions
// @desc    Obter todas as execuções de tarefas do usuário logado
// @access  Privado
router.get('/', auth, taskExecutionHistoryController.getTaskExecutions);

// @route   GET /api/task-executions/task/:taskId
// @desc    Obter o histórico de execuções para uma tarefa específica
// @access  Privado
router.get('/task/:taskId', auth, taskExecutionHistoryController.getExecutionsByTask);

module.exports = router;
