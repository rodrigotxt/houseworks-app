// models/TaskExecution.js
// Execucao: alguem cumpriu uma ocorrencia, e a conferencia de OUTRO membro.
// (Antes chamava-se TaskExecutionHistory; renomeado para o nome do contrato na Fase 3.)
//
// Ciclo de vida: pending_review -> approved (avaliada por outro membro)
//                              \-> auto_approved (a janela de avaliacao expirou)
//
// Desfazer REMOVE a execucao — e por isso os pontos somem junto, sem precisar de
// nenhum ajuste de placar. O evento fica registrado em log de auditoria.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const STATUSES = ['pending_review', 'approved', 'auto_approved'];

const TaskExecutionSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa da execucao e obrigatoria.'],
    },

    // Obrigatoria: no contrato, execucao nasce de uma ocorrencia concluida.
    occurrence: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskOccurrence',
      required: [true, 'A ocorrencia da execucao e obrigatoria.'],
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

    status: {
      type: String,
      enum: {
        values: STATUSES,
        message: 'O status deve ser pending_review, approved ou auto_approved.',
      },
      default: 'pending_review',
    },

    // Comentario de quem executou.
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'A nota deve ter no maximo 500 caracteres.'],
    },

    // default null: o contrato define rating como inteiro OU null, nunca ausente.
    rating: {
      type: Number,
      default: null,
      min: [1, 'A avaliacao minima e 1.'],
      max: [5, 'A avaliacao maxima e 5.'],
    },

    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    ratedAt: {
      type: Date,
      default: null,
    },

    // Comentario de quem avaliou. Separado de "note" para nao sobrescrever o
    // comentario de quem executou.
    ratingNote: {
      type: String,
      trim: true,
      maxlength: [500, 'A nota da avaliacao deve ter no maximo 500 caracteres.'],
    },

    // Copia dos pontos da ocorrencia no momento da conclusao.
    // So contam no placar quando o status e approved ou auto_approved.
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions(),
    toJSON: createJsonOptions(),
  }
);

TaskExecutionSchema.index({ household: 1, completionDate: -1 });

// Fila de conferencia e varredura da auto-aprovacao.
TaskExecutionSchema.index({ household: 1, status: 1, completionDate: 1 });

TaskExecutionSchema.index({ occurrence: 1, completionDate: -1 });
TaskExecutionSchema.index({ task: 1, completionDate: -1 });

TaskExecutionSchema.virtual('taskId').get(function taskId() {
  if (!this.task) return undefined;
  return String(this.task._id || this.task);
});

TaskExecutionSchema.virtual('occurrenceId').get(function occurrenceId() {
  if (!this.occurrence) return undefined;
  return String(this.occurrence._id || this.occurrence);
});

const TaskExecution = mongoose.model('TaskExecution', TaskExecutionSchema);

module.exports = TaskExecution;
module.exports.STATUSES = STATUSES;
