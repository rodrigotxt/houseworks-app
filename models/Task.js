// models/Task.js
const mongoose = require('mongoose');

// Define o esquema da Tarefa
const TaskSchema = new mongoose.Schema({
  // Nome da tarefa
  name: {
    type: String,
    required: [true, 'O nome da tarefa é obrigatório.'], // Campo obrigatório com mensagem de erro customizada
    trim: true, // Remove espaços em branco do início e fim
    minlength: [3, 'O nome da tarefa deve ter no mínimo 3 caracteres.'],
    maxlength: [100, 'O nome da tarefa deve ter no máximo 100 caracteres.']
  },

  // Frequência da tarefa (diária, semanal, mensal, etc.)
  frequency: {
    type: String,
    required: [true, 'A frequência da tarefa é obrigatória.'],
    enum: {
      values: ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'], // Valores permitidos
      message: 'A frequência deve ser diária, semanal, mensal, anual ou ocasional.'
    },
    default: 'semanal' // Valor padrão caso não seja fornecido
  },

  // Nível de dificuldade da tarefa
  difficulty: {
    type: String,
    required: [true, 'O nível de dificuldade é obrigatório.'],
    enum: {
      values: ['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'], // Valores permitidos
      message: 'A dificuldade deve ser muito_facil, facil, medio, dificil ou muito_dificil.'
    },
    default: 'medio' // Valor padrão
  },

  // Referência ao usuário que criou a tarefa
  createdBy: {
    type: mongoose.Schema.Types.ObjectId, // Tipo ObjectId para referenciar outro documento
    ref: 'User', // Nome do modelo ao qual este campo se refere (deve ser 'User' como você definiu)
    required: [true, 'O criador da tarefa é obrigatório.']
  },

  // Campo opcional para a data da próxima execução da tarefa (útil para agendamento)
  nextDueDate: {
    type: Date,
    // Pode ser calculado automaticamente ou definido manualmente
  },

  // Campo opcional para a data da última execução da tarefa
  lastCompletedDate: {
    type: Date,
  },

  // Status da tarefa (ex: pendente, concluída, em andamento)
  status: {
    type: String,
    enum: {
      values: ['pendente', 'concluida', 'em_andamento'],
      message: 'O status deve ser pendente, concluída ou em andamento.'
    },
    default: 'pendente'
  }

}, {
  timestamps: true // Adiciona automaticamente os campos `createdAt` e `updatedAt`
});

// Cria o modelo 'Task' a partir do esquema
const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
