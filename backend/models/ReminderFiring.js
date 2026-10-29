// models/ReminderFiring.js
// DISPARO materializado de um lembrete: um instante concreto em que ele toca.
//
// E o espelho da TaskOccurrence, com um recorte diferente: a ocorrencia e uma
// obrigacao que alguem cumpre; o disparo e um aviso que o sistema entrega.
//
// Materializar (em vez de calcular "o proximo" na hora) da tres coisas de graca:
//
//   1. idempotencia — o indice unico {reminder, fireAt, user} impede disparo duplo
//      mesmo com o job rodando em duas replicas;
//   2. adiar (snooze) — um disparo avulso e so mais um documento com kind 'snooze';
//   3. auditoria — da para ver o que foi entregue, pulado e por que.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const KINDS = ['schedule', 'snooze'];

const STATUSES = [
  'scheduled',  // gerado, ainda nao chegou a hora
  'processing', // reivindicado por um despachante (lock)
  'delivered',  // entregue aos destinatarios
  'skipped',    // nao entregue por uma regra (tarefa ja feita, sem destinatarios)
  'cancelled',  // o lembrete saiu do ar antes de tocar
  'missed',     // passou da janela de entrega (servidor parado, por exemplo)
];

const ReminderFiringSchema = new mongoose.Schema(
  {
    reminder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder',
      required: true,
    },

    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },

    // Instante absoluto em UTC. E a unica coisa que o despachante compara.
    fireAt: {
      type: Date,
      required: true,
    },

    // Dia e hora locais da casa, desnormalizados para leitura e diagnostico.
    localDate: {
      type: String,
      required: true,
    },

    localTime: {
      type: String,
      required: true,
    },

    kind: {
      type: String,
      enum: KINDS,
      default: 'schedule',
    },

    // Preenchido apenas em kind 'snooze': o adiamento e de UMA pessoa.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    status: {
      type: String,
      enum: STATUSES,
      default: 'scheduled',
    },

    // Por que foi pulado/cancelado. Texto curto e estavel, no mesmo espirito dos
    // codigos de erro: quem le o log entende sem abrir o codigo.
    reason: {
      type: String,
      default: null,
      maxlength: 200,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions({ omit: ['household', 'user', 'reminder'] }),
    toJSON: createJsonOptions({ omit: ['household', 'user', 'reminder'] }),
  }
);

// Idempotencia: no maximo um disparo agendado do mesmo lembrete no mesmo instante.
// O user entra na chave para permitir varios adiamentos no mesmo minuto (um por pessoa).
ReminderFiringSchema.index({ reminder: 1, fireAt: 1, user: 1 }, { unique: true });

// Consulta do despachante: "o que esta agendado e ja venceu".
ReminderFiringSchema.index({ status: 1, fireAt: 1 });

// Consulta da tela: "os proximos disparos deste lembrete".
ReminderFiringSchema.index({ reminder: 1, status: 1, fireAt: 1 });

ReminderFiringSchema.virtual('reminderId').get(function reminderId() {
  if (!this.reminder) return undefined;
  return String(this.reminder._id || this.reminder);
});

ReminderFiringSchema.virtual('householdId').get(function householdId() {
  if (!this.household) return undefined;
  return String(this.household._id || this.household);
});

const ReminderFiring = mongoose.model('ReminderFiring', ReminderFiringSchema);

module.exports = ReminderFiring;
module.exports.KINDS = KINDS;
module.exports.STATUSES = STATUSES;
