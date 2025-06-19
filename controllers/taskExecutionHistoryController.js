// controllers/taskExecutionHistoryController.js
const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const Task = require('../models/Task'); // Necessário para validar se a tarefa existe

// @desc    Registrar uma nova execução de tarefa
// @route   POST /api/task-executions
// @access  Privado (requer autenticação)
exports.createTaskExecution = async (req, res) => {
  const { taskId, note, rating } = req.body;
  const executedBy = req.user.id; // Usuário logado que executou a tarefa

  try {
    // 1. Verificar se a tarefa existe e se pertence ao usuário logado (opcional, mas boa prática)
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }
    if (task.createdBy.toString() !== executedBy) {
      return res.status(403).json({ message: 'Não autorizado a registrar execução para esta tarefa.' });
    }

    // 2. Criar o novo registro de execução
    const newExecution = new TaskExecutionHistory({
      task: taskId,
      executedBy,
      note,
      rating
    });

    const execution = await newExecution.save();

    // 3. Opcional: Atualizar a data de última conclusão na própria tarefa
    task.lastCompletedDate = execution.completionDate;
    // Você pode adicionar lógica para calcular nextDueDate aqui, dependendo da frequência
    await task.save();

    res.status(201).json({ message: 'Execução de tarefa registrada com sucesso!', execution });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Erro ao registrar execução da tarefa:', error);
    res.status(500).send('Erro interno do servidor ao registrar execução da tarefa.');
  }
};

// @desc    Obter o histórico de execuções de tarefas para o usuário logado
// @route   GET /api/task-executions
// @access  Privado
exports.getTaskExecutions = async (req, res) => {
  try {
    // Busca execuções do usuário logado e popula os detalhes da tarefa
    const executions = await TaskExecutionHistory.find({ executedBy: req.user.id })
      .populate('task', 'name frequency difficulty') // Popula apenas alguns campos da tarefa
      .sort({ completionDate: -1 }); // Ordena pelas mais recentes

    res.status(200).json(executions);
  } catch (error) {
    console.error('Erro ao buscar histórico de execuções:', error);
    res.status(500).send('Erro interno do servidor ao buscar histórico de execuções.');
  }
};

// @desc    Obter o histórico de execuções para uma tarefa específica
// @route   GET /api/task-executions/task/:taskId
// @access  Privado
exports.getExecutionsByTask = async (req, res) => {
  const { taskId } = req.params;
  const executedBy = req.user.id; // Opcional: para garantir que o usuário só veja histórico de suas próprias tarefas

  try {
    // Busca as execuções de uma tarefa específica, garantindo que pertença ao usuário logado
    const executions = await TaskExecutionHistory.find({ task: taskId, executedBy })
      .populate('executedBy', 'username email') // Popula informações do usuário que executou (se diferente do criador)
      .sort({ completionDate: -1 });

    res.status(200).json(executions);
  } catch (error) {
    console.error('Erro ao buscar histórico por tarefa:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID da tarefa inválido.' });
    }
    res.status(500).send('Erro interno do servidor ao buscar histórico por tarefa.');
  }
};
