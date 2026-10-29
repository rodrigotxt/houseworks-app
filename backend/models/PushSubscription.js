// models/PushSubscription.js
// Inscricao de Web Push de UM navegador/aparelho de um usuario.
//
// EXCECAO CONSCIENTE a invariante "todo documento de dominio tem household": uma
// inscricao push e do APARELHO, nao da casa. O mesmo celular recebe avisos de duas
// casas diferentes; duplicar a inscricao por casa faria o navegador manter dois
// endpoints para o mesmo aparelho. Como RevokedToken, este documento e de
// identidade/infraestrutura, nao de dominio.
//
// A chave e o endpoint: o navegador devolve a mesma URL ao renovar a inscricao, e e
// por ela que se remove o aparelho perdido (404/410 do servico de push).

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const PushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    endpoint: {
      type: String,
      required: true,
      trim: true,
    },

    // Chaves geradas pelo navegador (p256dh e auth). Sao segredo do transporte:
    // nunca voltam numa serializacao.
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toObject: createJsonOptions({ omit: ['keys'] }),
    toJSON: createJsonOptions({ omit: ['keys'] }),
  }
);

PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
PushSubscriptionSchema.index({ user: 1 });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);
