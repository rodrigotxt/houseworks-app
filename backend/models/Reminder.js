// models/Reminder.js
// LEMBRETE da casa: um aviso que a casa agenda para si mesma.
//
// A diferenca para a Task e de proposito: a tarefa e um DEVER que gera ocorrencia,
// execucao, nota e ponto; o lembrete e um AVISO que gera disparo e notificacao.
// Nada de pontos, nada de avaliacao.
//
// O lembrete pertence a Household (como todo documento de dominio) e reaproveita a
// MESMA expansao de recorrencia das tarefas (services/recurrence.js): "diaria" aqui
// significa o mesmo que la, e "ocasional" e o disparo unico.
//
// O que ele acrescenta a uma recorrencia: a HORA (time, no fuso da casa), os
// DESTINATARIOS e os CANAIS de entrega.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');
const { validateRecurrence } = require('../services/recurrence');

// Mesmas frequencias da Task: "ocasional" e o disparo unico.
const FREQUENCIES = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];

// Canais de entrega. "in_app" e o mais barato e sempre funciona (a caixa de
// notificacoes do proprio app); "push" e Web Push (PWA). email/sms estao no enum
// para o contrato nao precisar mudar quando existirem — hoje sao recusados na
// criacao com CHANNEL_NOT_AVAILABLE (services/channels.js).
const CHANNELS = ['in_app', 'push', 'email', 'sms'];

const STATUSES = ['active', 'paused', 'archived'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const ScheduleSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      required: [true, 'A frequencia do lembrete e obrigatoria.'],
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
      required: [true, 'A data de inicio do lembrete e obrigatoria.'],
      match: [DATE_PATTERN, 'A data de inicio deve estar no formato AAAA-MM-DD.'],
    },

    endDate: {
      type: String,
      match: [DATE_PATTERN, 'A data final deve estar no formato AAAA-MM-DD.'],
    },

    // Hora local da casa. E o que a recorrencia da tarefa nao tem — e o que faz um
    // lembrete de medicacao as 21h ser util.
    time: {
      type: String,
      required: [true, 'A hora do lembrete e obrigatoria.'],
      match: [TIME_PATTERN, 'A hora deve estar no formato HH:MM (24 horas).'],
    },
  },
  { _id: false }
);

const ReminderSchema = new mongoose.Schema(
  {
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa do lembrete e obrigatoria.'],
    },

    title: {
      type: String,
      required: [true, 'O titulo do lembrete e obrigatorio.'],
      trim: true,
      minlength: [3, 'O titulo do lembrete deve ter no minimo 3 caracteres.'],
      maxlength: [100, 'O titulo do lembrete deve ter no maximo 100 caracteres.'],
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'As observacoes devem ter no maximo 500 caracteres.'],
    },

    // Quem criou. Nao define visibilidade (a visibilidade e a casa), mas e o que
    // permite a crianca gerenciar os lembretes dela sem poder mexer nos dos outros.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O criador do lembrete e obrigatorio.'],
    },

    schedule: {
      type: ScheduleSchema,
      required: [true, 'A recorrencia do lembrete e obrigatoria.'],
    },

    // Destinatarios concretos. Vazio quando allMembers e true.
    recipients: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },

    // "Todos" e dinamico: resolvido no disparo contra a Membership. Um membro que
    // entrar depois passa a receber — e um membro que sair para de receber.
    allMembers: {
      type: Boolean,
      default: false,
    },

    // Canais de entrega. "in_app" e o padrao: nao depende de permissao nenhuma.
    channels: {
      type: [String],
      default: () => ['in_app'],
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length > 0 &&
          values.every((channel) => CHANNELS.indexOf(channel) !== -1),
        message: 'Informe ao menos um canal valido: in_app, push, email ou sms.',
      },
    },

    // Vinculo OPCIONAL com uma tarefa: "me avise de conferir se a tarefa foi feita".
    // Com task preenchida e skipIfTaskDone, o disparo e cancelado quando a ocorrencia
    // do dia ja esta done/skipped — o lembrete deixa de incomodar quem ja fez.
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },

    skipIfTaskDone: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: {
        values: STATUSES,
        message: 'O status deve ser active, paused ou archived.',
      },
      default: 'active',
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    // Controle interno do gerador de disparos: ate que dia ja materializamos.
    // Nunca serializado.
    firingsGeneratedUntil: {
      type: String,
      default: null,
      match: [DATE_PATTERN, 'A data deve estar no formato AAAA-MM-DD.'],
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions({ omit: ['firingsGeneratedUntil', 'household'] }),
    toJSON: createJsonOptions({ omit: ['firingsGeneratedUntil', 'household'] }),
  }
);

ReminderSchema.index({ household: 1, status: 1 });
ReminderSchema.index({ household: 1, createdBy: 1 });
ReminderSchema.index({ household: 1, recipients: 1 });
ReminderSchema.index({ task: 1 });

ReminderSchema.pre('validate', function prepareReminder(next) {
  const problems = validateRecurrence(this.schedule);
  if (problems.length > 0) {
    this.invalidate('schedule', problems.join(' '));
  }

  // Sem duplicatas: o mesmo membro nao recebe duas vezes.
  const unique = [];
  (this.recipients || []).forEach((id) => {
    const text = String(id);
    if (unique.indexOf(text) === -1) unique.push(text);
  });
  this.recipients = unique;

  if (this.allMembers && this.recipients.length > 0) {
    this.invalidate('recipients', 'Com allMembers, nao envie destinatarios.');
  }

  if (!this.allMembers && this.recipients.length === 0) {
    this.invalidate('recipients', 'Informe ao menos um destinatario (ou allMembers).');
  }

  if (this.channels && this.channels.length === 0) {
    this.invalidate('channels', 'Informe ao menos um canal.');
  }

  next();
});

// Mesmo padrao da Task: o cliente recebe o identificador, nao a referencia crua.
ReminderSchema.virtual('householdId').get(function householdId() {
  if (!this.household) return undefined;
  return String(this.household._id || this.household);
});

const Reminder = mongoose.model('Reminder', ReminderSchema);

module.exports = Reminder;
module.exports.FREQUENCIES = FREQUENCIES;
module.exports.CHANNELS = CHANNELS;
module.exports.STATUSES = STATUSES;
module.exports.TIME_PATTERN = TIME_PATTERN;
