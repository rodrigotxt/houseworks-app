// models/TaskOccurrence.js
// Ocorrencia: a obrigacao concreta e datada, gerada a partir da recorrencia da tarefa.
// E a unidade que o usuario ve na agenda e a que carrega atraso e conclusao.
//
// dueDate e STRING 'YYYY-MM-DD' (o dia local da casa), nao Date. Isso elimina a
// classe de bug mais comum do projeto — comparar strings ISO funciona
// lexicograficamente e nao ha fuso para errar no meio.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const STATUSES = ['pending', 'done', 'overdue', 'skipped'];

const TaskOccurrenceSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa da ocorrencia e obrigatoria.'],
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'A tarefa da ocorrencia e obrigatoria.'],
    },

    dueDate: {
      type: String,
      required: [true, 'A data de vencimento e obrigatoria.'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'A data de vencimento deve estar no formato AAAA-MM-DD.'],
    },

    // Responsavel desta ocorrencia. null = qualquer membro pode assumir.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: STATUSES,
        message: 'O status deve ser pending, done, overdue ou skipped.',
      },
      default: 'pending',
    },

    // Copia dos pontos vigentes da tarefa no momento da geracao: mudar os pontos da
    // tarefa depois nao pode reescrever o que ja valeu no passado.
    points: {
      type: Number,
      default: 0,
      min: 0,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    skippedReason: {
      type: String,
      trim: true,
      maxlength: [300, 'O motivo deve ter no maximo 300 caracteres.'],
      default: null,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions(),
    toJSON: createJsonOptions(),
  }
);

// Idempotencia do gerador: a mesma tarefa nao pode ter duas ocorrencias no mesmo dia.
TaskOccurrenceSchema.index({ task: 1, dueDate: 1 }, { unique: true });

// Agenda da casa.
TaskOccurrenceSchema.index({ household: 1, dueDate: 1, status: 1 });

// "Minhas tarefas" e a rotacao de responsavel.
TaskOccurrenceSchema.index({ household: 1, assignedTo: 1, dueDate: 1 });

// O contrato expoe taskId alem do resumo "task".
TaskOccurrenceSchema.virtual('taskId').get(function taskId() {
  if (!this.task) return undefined;
  return String(this.task._id || this.task);
});

const TaskOccurrence = mongoose.model('TaskOccurrence', TaskOccurrenceSchema);

module.exports = TaskOccurrence;
module.exports.STATUSES = STATUSES;
