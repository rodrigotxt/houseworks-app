// models/TaskExecutionHistory.js
const mongoose = require('mongoose');

// Define o esquema para o Histórico de Execução de Tarefas
const TaskExecutionHistorySchema = new mongoose.Schema({
  // Referência à tarefa que foi executada
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task', // Refere-se ao modelo 'Task'
    required: [true, 'A tarefa executada é obrigatória.']
  },

  // Referência ao usuário que executou a tarefa
  executedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Refere-se ao modelo 'User'
    required: [true, 'O usuário que executou a tarefa é obrigatório.']
  },

  // Data e hora em que a tarefa foi concluída
  completionDate: {
    type: Date,
    default: Date.now, // Define a data atual como padrão
    required: [true, 'A data de conclusão é obrigatória.']
  },

  // Nota ou observação sobre a execução da tarefa
  note: {
    type: String,
    trim: true, // Remove espaços em branco
    maxlength: [500, 'A nota deve ter no máximo 500 caracteres.'] // Limite de caracteres para a nota
  },

  // Nível de satisfação ou avaliação (opcional, de 1 a 5, por exemplo)
  rating: {
    type: Number,
    min: [1, 'A avaliação mínima é 1.'],
    max: [5, 'A avaliação máxima é 5.']
  }
}, {
  timestamps: true // Adiciona automaticamente `createdAt` e `updatedAt`
});

// Adiciona um índice composto para garantir que um usuário não possa registrar a mesma tarefa como concluída
// exatamente ao mesmo tempo, ou para otimizar buscas por tarefa e usuário.
// Pode ajustar conforme a necessidade de negócio.
TaskExecutionHistorySchema.index({ task: 1, executedBy: 1, completionDate: 1 });

// Cria o modelo 'TaskExecutionHistory' a partir do esquema
const TaskExecutionHistory = mongoose.model('TaskExecutionHistory', TaskExecutionHistorySchema);

module.exports = TaskExecutionHistory;
