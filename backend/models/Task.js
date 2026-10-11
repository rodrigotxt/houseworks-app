// models/Task.js
// Dever recorrente da CASA. Antes da Fase 1 a tarefa pertencia a quem a criou
// (createdBy) — o que a tornava invisivel para o resto da familia. Agora ela
// pertence a Household e createdBy e apenas auditoria.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');
const { pointsForDifficulty } = require('../utils/points');

const FREQUENCIES = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];
const DIFFICULTIES = ['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'];
const STATUSES = ['active', 'archived'];

const TaskSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa da tarefa e obrigatoria.'],
    },

    name: {
      type: String,
      required: [true, 'O nome da tarefa e obrigatorio.'],
      trim: true,
      minlength: [3, 'O nome da tarefa deve ter no minimo 3 caracteres.'],
      maxlength: [100, 'O nome da tarefa deve ter no maximo 100 caracteres.'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'A descricao deve ter no maximo 500 caracteres.'],
    },

    // Fase 2 troca isto pelo objeto "recurrence" do contrato, com RRULE por tras.
    frequency: {
      type: String,
      required: [true, 'A frequencia da tarefa e obrigatoria.'],
      enum: {
        values: FREQUENCIES,
        message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
      },
      default: 'semanal',
    },

    difficulty: {
      type: String,
      required: [true, 'O nivel de dificuldade e obrigatorio.'],
      enum: {
        values: DIFFICULTIES,
        message: 'A dificuldade deve ser muito_facil, facil, medio, dificil ou muito_dificil.',
      },
      default: 'medio',
    },

    // Derivado da dificuldade quando nao informado; pode ser sobreposto.
    points: {
      type: Number,
      min: [0, 'Os pontos nao podem ser negativos.'],
      max: [100, 'Os pontos devem ser no maximo 100.'],
    },

    // Responsavel fixo. null = qualquer membro pode assumir.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: STATUSES,
        message: 'O status deve ser active ou archived.',
      },
      default: 'active',
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    // Auditoria: quem criou. Nao define mais visibilidade nem permissao.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O criador da tarefa e obrigatorio.'],
    },

    lastCompletedDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions(),
    toJSON: createJsonOptions(),
  }
);

// Consulta principal da tela de tarefas: "as tarefas ativas desta casa".
TaskSchema.index({ household: 1, status: 1 });
// Filtro por responsavel (inclui a busca por "sem responsavel").
TaskSchema.index({ household: 1, assignedTo: 1 });

TaskSchema.pre('validate', function fillPoints(next) {
  if (this.points === undefined || this.points === null) {
    this.points = pointsForDifficulty(this.difficulty);
  }
  next();
});

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
module.exports.FREQUENCIES = FREQUENCIES;
module.exports.DIFFICULTIES = DIFFICULTIES;
module.exports.STATUSES = STATUSES;
