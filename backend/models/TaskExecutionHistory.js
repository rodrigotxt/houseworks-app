// models/TaskExecutionHistory.js
// Registro de que alguem cumpriu uma tarefa, e a conferencia de OUTRO membro.
//
// Fase 1b: ganhou "household". E isto que fecha o P4 — antes, qualquer usuario
// autenticado podia registrar execucao para qualquer tarefa, porque nao existia
// nada que delimitassse "mesma casa".
//
// Fase 3 renomeia para TaskExecution e acrescenta status (pending_review/approved),
// ratedBy e points.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const TaskExecutionHistorySchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa da execucao e obrigatoria.'],
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'A tarefa executada e obrigatoria.'],
    },

    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O usuario que executou a tarefa e obrigatorio.'],
    },

    completionDate: {
      type: Date,
      default: Date.now,
      required: [true, 'A data de conclusao e obrigatoria.'],
    },

    // Comentario de quem executou.
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'A nota deve ter no maximo 500 caracteres.'],
    },

    rating: {
      type: Number,
      min: [1, 'A avaliacao minima e 1.'],
      max: [5, 'A avaliacao maxima e 5.'],
    },

    // Comentario de quem avaliou. Separado de "note" para nao sobrescrever o
    // comentario de quem executou.
    ratingNote: {
      type: String,
      trim: true,
      maxlength: [500, 'A nota da avaliacao deve ter no maximo 500 caracteres.'],
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions(),
    toJSON: createJsonOptions(),
  }
);

TaskExecutionHistorySchema.index({ household: 1, completionDate: -1 });
TaskExecutionHistorySchema.index({ task: 1, completionDate: -1 });

module.exports = mongoose.model('TaskExecutionHistory', TaskExecutionHistorySchema);
