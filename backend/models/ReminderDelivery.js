// models/ReminderDelivery.js
// ENTREGA de um disparo para UMA pessoa. E a caixa de notificacoes.
//
// Um disparo pode ter varios destinatarios; cada um tem a propria entrega, com o
// proprio estado de leitura e de "feito". O canal e por entrega, e nao por disparo:
// o push pode falhar no aparelho de um filho enquanto o in_app funciona para todos.
//
// Este documento tambem e o que responde "eu ja vi isso?" e "eu ja resolvi isso?".

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const CHANNEL_STATUSES = ['sent', 'skipped', 'failed'];

const ChannelResultSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: CHANNEL_STATUSES,
      required: true,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    // Motivo curto quando nao foi enviado: sem_inscricao, push_nao_configurado,
    // canal_indisponivel, erro do provedor.
    reason: {
      type: String,
      default: null,
      maxlength: 200,
    },
  },
  { _id: false }
);

const ReminderDeliverySchema = new mongoose.Schema(
  {
    firing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReminderFiring',
      required: true,
    },

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

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    channels: {
      type: [ChannelResultSchema],
      default: [],
    },

    readAt: {
      type: Date,
      default: null,
    },

    // "Feito". Nao apaga o lembrete nem interrompe a recorrencia: um remedio das 21h
    // continua valendo amanha. So tira aquele aviso da lista de pendentes.
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions({ omit: ['household', 'firing', 'user'] }),
    toJSON: createJsonOptions({ omit: ['household', 'firing', 'user'] }),
  }
);

// Um disparo entrega no maximo uma vez para a mesma pessoa.
ReminderDeliverySchema.index({ firing: 1, user: 1 }, { unique: true });

// A caixa de notificacoes: "o que e meu, mais novo primeiro".
ReminderDeliverySchema.index({ user: 1, createdAt: -1 });

// "O que ainda nao li" / "o que ja resolvi".
ReminderDeliverySchema.index({ user: 1, readAt: 1 });

ReminderDeliverySchema.virtual('reminderId').get(function reminderId() {
  if (!this.reminder) return undefined;
  return String(this.reminder._id || this.reminder);
});

ReminderDeliverySchema.virtual('householdId').get(function householdId() {
  if (!this.household) return undefined;
  return String(this.household._id || this.household);
});

const ReminderDelivery = mongoose.model('ReminderDelivery', ReminderDeliverySchema);

module.exports = ReminderDelivery;
module.exports.CHANNEL_STATUSES = CHANNEL_STATUSES;
