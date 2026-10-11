// models/Household.js
// A casa. Raiz do isolamento: todo documento de dominio pertence a uma Household.

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');

const HouseholdSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome da casa e obrigatorio.'],
      trim: true,
      minlength: [2, 'O nome da casa deve ter no minimo 2 caracteres.'],
      maxlength: [80, 'O nome da casa deve ter no maximo 80 caracteres.'],
    },

    // Fuso IANA usado em todo calculo de "dia" do produto (Fase 2).
    timezone: {
      type: String,
      default: 'America/Sao_Paulo',
      trim: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O dono da casa e obrigatorio.'],
    },

    // Prazo para outro membro avaliar uma execucao antes da auto-aprovacao (Fase 3).
    ratingWindowHours: {
      type: Number,
      default: 72,
      min: [1, 'A janela de avaliacao minima e 1 hora.'],
      max: [720, 'A janela de avaliacao maxima e 720 horas.'],
    },

    // Tolerancia, em horas, depois do fim do dia de vencimento antes de a ocorrencia
    // virar "atrasada". 0 = vira atrasada assim que o dia termina.
    overdueGraceHours: {
      type: Number,
      default: 0,
      min: [0, 'A tolerancia nao pode ser negativa.'],
      max: [168, 'A tolerancia maxima e 168 horas (7 dias).'],
    },

    // Quantos dias de ocorrencias o gerador materializa a frente (Fase 2).
    horizonDays: {
      type: Number,
      default: 30,
      min: [1, 'O horizonte minimo e 1 dia.'],
      max: [365, 'O horizonte maximo e 365 dias.'],
    },

    // select: false — o codigo de convite NUNCA sai em uma serializacao comum.
    // So e devolvido pelas rotas dedicadas, com .select('+inviteCode').
    inviteCode: {
      type: String,
      select: false,
      index: true,
    },

    inviteCodeExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    // inviteCode/inviteCodeExpiresAt tambem sao omitidos na serializacao.
    // O select:false acima protege o que vem de CONSULTA, mas nao um documento
    // recem-criado em memoria — foi assim que o codigo vazou no POST /households.
    toObject: createJsonOptions({ omit: ['inviteCode', 'inviteCodeExpiresAt'] }),
    toJSON: createJsonOptions({ omit: ['inviteCode', 'inviteCodeExpiresAt'] }),
  }
);

HouseholdSchema.index({ ownerId: 1 });

module.exports = mongoose.model('Household', HouseholdSchema);
