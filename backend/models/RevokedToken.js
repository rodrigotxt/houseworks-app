// models/RevokedToken.js
// Lista de revogacao de JWT.
//
// JWT e stateless: sem isto, "sair" so apagaria o cookie, e um token vazado continuaria
// valendo ate expirar. O indice TTL faz a colecao se limpar sozinha — guardamos apenas
// o identificador (jti) ate o momento em que o token morreria de qualquer forma.

const mongoose = require('mongoose');

const RevokedTokenSchema = new mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
    },

    // Quando este registro pode sumir: exatamente quando o token expiraria.
    expiresAt: {
      type: Date,
      required: true,
    },

    reason: {
      type: String,
      enum: ['logout', 'refresh'],
      default: 'logout',
    },
  },
  { timestamps: true }
);

// O Mongo apaga o documento sozinho na hora marcada.
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', RevokedTokenSchema);
