// models/Task.js
// Dever recorrente da CASA. A tarefa pertence a Household; createdBy e apenas auditoria.
//
// Fase 2: "frequency" virou o objeto "recurrence" do contrato, e as ocorrencias
// passam a ser materializadas a partir dele (services/occurrences.js).

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');
const { pointsForDifficulty } = require('../utils/points');
const { validateRecurrence } = require('../services/recurrence');

const FREQUENCIES = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];
const DIFFICULTIES = ['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'];
const STATUSES = ['active', 'archived'];
const ASSIGNMENT_STRATEGIES = ['fixed', 'rotate'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RecurrenceSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      required: [true, 'A frequencia da tarefa e obrigatoria.'],
      enum: {
        values: FREQUENCIES,
        message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
      },
    },

    interval: {
      type: Number,
      default: 1,
      min: [1, 'O intervalo minimo e 1.'],
      max: [52, 'O intervalo maximo e 52.'],
    },

    // 0 = domingo. Obrigatorio quando a frequencia e semanal.
    weekdays: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (values) => !values || values.every((day) => day >= 0 && day <= 6),
        message: 'Os dias da semana vao de 0 (domingo) a 6 (sabado).',
      },
    },

    // Para mensal/anual. Se o mes nao tiver o dia, cai no ultimo dia do mes.
    dayOfMonth: {
      type: Number,
      min: [1, 'O dia do mes minimo e 1.'],
      max: [31, 'O dia do mes maximo e 31.'],
    },

    startDate: {
      type: String,
      required: [true, 'A data de inicio da recorrencia e obrigatoria.'],
      match: [DATE_PATTERN, 'A data de inicio deve estar no formato AAAA-MM-DD.'],
    },

    endDate: {
      type: String,
      match: [DATE_PATTERN, 'A data final deve estar no formato AAAA-MM-DD.'],
    },
  },
  { _id: false }
);

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

    recurrence: {
      type: RecurrenceSchema,
      required: [true, 'A recorrencia da tarefa e obrigatoria.'],
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

    points: {
      type: Number,
      min: [0, 'Os pontos nao podem ser negativos.'],
      max: [100, 'Os pontos devem ser no maximo 100.'],
    },

    // Com "fixed", vale o assignedTo. Com "rotate", as ocorrencias sao distribuidas
    // em rodizio entre os membros da casa (ver services/occurrences.js).
    assignmentStrategy: {
      type: String,
      enum: {
        values: ASSIGNMENT_STRATEGIES,
        message: 'A estrategia de atribuicao deve ser fixed ou rotate.',
      },
      default: 'fixed',
    },

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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O criador da tarefa e obrigatorio.'],
    },

    lastCompletedDate: {
      type: Date,
      default: null,
    },

    // Controle interno do gerador: ate que data as ocorrencias ja foram materializadas.
    // Nao faz parte do contrato e nunca e serializado.
    occurrencesGeneratedUntil: {
      type: String,
      default: null,
      match: [DATE_PATTERN, 'A data deve estar no formato AAAA-MM-DD.'],
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions({ omit: ['occurrencesGeneratedUntil'] }),
    toJSON: createJsonOptions({ omit: ['occurrencesGeneratedUntil'] }),
  }
);

TaskSchema.index({ household: 1, status: 1 });
TaskSchema.index({ household: 1, assignedTo: 1 });

TaskSchema.pre('validate', function prepareTask(next) {
  if (this.points === undefined || this.points === null) {
    this.points = pointsForDifficulty(this.difficulty);
  }

  // Validacoes cruzadas que o schema sozinho nao expressa (semanal exige weekdays).
  const problems = validateRecurrence(this.recurrence);

  if (problems.length > 0) {
    this.invalidate('recurrence', problems.join(' '));
  }

  next();
});

const Task = mongoose.model('Task', TaskSchema);

module.exports = Task;
module.exports.FREQUENCIES = FREQUENCIES;
module.exports.DIFFICULTIES = DIFFICULTIES;
module.exports.STATUSES = STATUSES;
module.exports.ASSIGNMENT_STRATEGIES = ASSIGNMENT_STRATEGIES;
