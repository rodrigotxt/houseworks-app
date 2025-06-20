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
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }
    // A validação de pertinência da tarefa ao usuário criador é feita na criação da tarefa
    // Aqui, estamos registrando quem EXECUTOU, que pode ser diferente do criador (se o app permitir)
    // Se a regra for que apenas o CRIADOR pode registrar execução, a linha abaixo é necessária
    // if (task.createdBy.toString() !== executedBy) {
    //   return res.status(403).json({ message: 'Não autorizado a registrar execução para esta tarefa.' });
    // }


    const newExecution = new TaskExecutionHistory({
      task: taskId,
      executedBy,
      note,
      rating
    });

    const execution = await newExecution.save();

    // Opcional: Atualizar a data de última conclusão na própria tarefa
    task.lastCompletedDate = execution.completionDate;
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
    // Busca execuções do usuário logado
    const executions = await TaskExecutionHistory.find({ executedBy: req.user.id })
      .populate('task', 'name difficulty') // Popula a tarefa (campos específicos)
      .populate('executedBy', 'name username email') // Popula o usuário que executou (campos específicos)
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
    // Busca as execuções de uma tarefa específica
    // Se você quer que o usuário logado só veja execuções de suas próprias tarefas, mantenha o `executedBy`
    const executions = await TaskExecutionHistory.find({ task: taskId }) // Removi `executedBy` aqui para mostrar todas as execuções da tarefa,
                                                                          // independente de quem a executou (dentro do contexto de um app doméstico)
      .populate('executedBy', 'name username email') // Popula informações do usuário que executou
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

exports.addNoteOrRating = async (req, res) => {
  const { taskExecutionId } = req.params;
  const { note, rating } = req.body;

  try {
    const task = await TaskExecutionHistory.findById(taskExecutionId);

    if (!task) {
      return res.status(404).json({ message: 'Tarefa nao encontrada.' });
    }

    // Garante que o usuário logado seja diferente de quem executou a tarefa
    if (task.executedBy.toString() == req.user.id) {
      return res.status(403).json({ message: 'Nao autorizado a atualizar esta tarefa.' });
    }

    task.note = note;
    task.rating = rating;

    await task.save();

    res.status(200).json({ message: 'Notas e avaliação atualizadas com sucesso!', task });
  } catch (error) {
    console.error('Erro ao atualizar notas e avaliação da tarefa:', error);
    res.status(500).send('Erro interno do servidor ao atualizar notas e avaliação da tarefa.');
  }
};