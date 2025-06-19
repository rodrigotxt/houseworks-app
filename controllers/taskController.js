// controllers/taskController.js
const Task = require('../models/Task'); // Importa o modelo de Tarefa

// @desc    Criar uma nova tarefa
// @route   POST /api/tasks
// @access  Privado (requer autenticação)
exports.createTask = async (req, res) => {
  const { name, frequency, difficulty } = req.body;

  try {
    // O ID do usuário logado vem do middleware 'auth' em req.user.id
    const newTask = new Task({
      name,
      frequency,
      difficulty,
      createdBy: req.user.id, // O usuário logado é o criador
    });

    const task = await newTask.save();
    res.status(201).json({ message: 'Tarefa criada com sucesso!', task });
  } catch (error) {
    // Trata erros de validação do Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Erro ao criar tarefa:', error);
    res.status(500).send('Erro interno do servidor ao criar tarefa.');
  }
};

// @desc    Obter todas as tarefas (filtrando pelo usuário logado)
// @route   GET /api/tasks
// @access  Privado
exports.getAllTasks = async (req, res) => {
  try {
    // Busca apenas as tarefas criadas pelo usuário logado
    const tasks = await Task.find({ createdBy: req.user.id }).sort({ createdAt: -1 }); // Ordena pelas mais recentes
    res.status(200).json(tasks);
  } catch (error) {
    console.error('Erro ao buscar tarefas:', error);
    res.status(500).send('Erro interno do servidor ao buscar tarefas.');
  }
};

// @desc    Obter uma tarefa específica por ID
// @route   GET /api/tasks/:id
// @access  Privado
exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    // Garante que o usuário logado só possa ver suas próprias tarefas
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Não autorizado a acessar esta tarefa.' });
    }

    res.status(200).json(task);
  } catch (error) {
    console.error('Erro ao buscar tarefa por ID:', error);
    // Erro comum quando o ID não é um ObjectId válido
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID de tarefa inválido.' });
    }
    res.status(500).send('Erro interno do servidor ao buscar tarefa.');
  }
};

// @desc    Atualizar uma tarefa existente
// @route   PUT /api/tasks/:id
// @access  Privado
exports.updateTask = async (req, res) => {
  const { name, frequency, difficulty, status, nextDueDate, lastCompletedDate } = req.body;

  try {
    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    // Garante que o usuário logado só possa atualizar suas próprias tarefas
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Não autorizado a atualizar esta tarefa.' });
    }

    // Atualiza os campos se eles forem fornecidos na requisição
    task.name = name ?? task.name;
    task.frequency = frequency ?? task.frequency;
    task.difficulty = difficulty ?? task.difficulty;
    task.status = status ?? task.status;
    task.nextDueDate = nextDueDate ?? task.nextDueDate;
    task.lastCompletedDate = lastCompletedDate ?? task.lastCompletedDate;


    await task.save(); // Salva as alterações, acionando validações e timestamps.updatedAt

    res.status(200).json({ message: 'Tarefa atualizada com sucesso!', task });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    // Erro comum quando o ID não é um ObjectId válido
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID de tarefa inválido.' });
    }
    console.error('Erro ao atualizar tarefa:', error);
    res.status(500).send('Erro interno do servidor ao atualizar tarefa.');
  }
};

// @desc    Deletar uma tarefa
// @route   DELETE /api/tasks/:id
// @access  Privado
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    // Garante que o usuário logado só possa deletar suas próprias tarefas
    if (task.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Não autorizado a deletar esta tarefa.' });
    }

    await Task.deleteOne({ _id: req.params.id }); // Ou task.remove() se preferir
    res.status(200).json({ message: 'Tarefa removida com sucesso!' });
  } catch (error) {
    // Erro comum quando o ID não é um ObjectId válido
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID de tarefa inválido.' });
    }
    console.error('Erro ao deletar tarefa:', error);
    res.status(500).send('Erro interno do servidor ao deletar tarefa.');
  }
};
