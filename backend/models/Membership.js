// models/Membership.js
// Vinculo entre um usuario e uma casa. E aqui que mora a autorizacao.
//
// Guarda o papel e sobreposicoes opcionais; as capacidades efetivas sao derivadas
// (utils/capabilities.js) e expostas como virtual "capabilities".

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');
const { ROLES, resolveCapabilities } = require('../utils/capabilities');
const { DIAS_NA_SEMANA, MINUTOS_POR_DIA_MAX } = require('../utils/freeTime');

// Tempo livre para executar as tarefas. Configuracao semanal que se repete.
//
// Ausente (null) significa NUNCA CONFIGURADO, e isso e diferente de zero: quem tem
// zero gera um aviso de carga legitimo; quem esta null fica fora do aviso.
const FreeTimeSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: {
        values: ['fixo', 'por_dia'],
        message: 'O modo do tempo livre deve ser fixo ou por_dia.',
      },
      default: 'fixo',
    },

    // So vale no modo "fixo".
    fixedMinutes: {
      type: Number,
      min: [0, 'O tempo livre nao pode ser negativo.'],
      max: [MINUTOS_POR_DIA_MAX, 'O tempo livre deve ser no maximo 1440 minutos (24 horas).'],
      default: null,
    },

    // Sete posicoes, domingo primeiro. So vale no modo "por_dia".
    byWeekday: {
      type: [{ type: Number, min: 0, max: MINUTOS_POR_DIA_MAX }],
      default: undefined,
      validate: {
        validator: (valores) => valores === undefined || valores.length === DIAS_NA_SEMANA,
        message: 'O tempo livre por dia precisa de exatamente 7 posicoes (domingo a sabado).',
      },
    },
  },
  { _id: false }
);

const MembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'O usuario da membership e obrigatorio.'],
    },

    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: [true, 'A casa da membership e obrigatoria.'],
    },

    role: {
      type: String,
      required: [true, 'O papel e obrigatorio.'],
      enum: {
        values: ROLES,
        message: 'O papel deve ser owner, adult ou child.',
      },
      default: 'child',
    },

    // Sobreposicoes pontuais sobre o padrao do papel. Ausente = usa o padrao.
    overrides: {
      canAssign: { type: Boolean },
      canRate: { type: Boolean },
      canManageTasks: { type: Boolean },
      canManageMembers: { type: Boolean },
      canManageReminders: { type: Boolean },
    },

    freeTime: {
      type: FreeTimeSchema,
      default: null,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    // O contrato expoe householdId, nao o objeto household inteiro.
    toObject: createJsonOptions({ omit: ['overrides', 'household'] }),
    toJSON: createJsonOptions({ omit: ['overrides', 'household'] }),
  }
);

// Capacidades efetivas: sempre derivadas, nunca gravadas.
MembershipSchema.virtual('capabilities').get(function capabilities() {
  return resolveCapabilities(this.role, this.overrides);
});

// ATENCAO: nao usar ".id" aqui. Em um ObjectId cru, ".id" e um getter que devolve o
// buffer binario — String() dele produz bytes ilegiveis. Um documento populado tem
// "_id"; um ObjectId nao populado precisa do String() direto.
MembershipSchema.virtual('householdId').get(function householdId() {
  if (!this.household) {
    return undefined;
  }

  return String(this.household._id || this.household);
});

// Um usuario so pode ter uma membership por casa.
MembershipSchema.index({ user: 1, household: 1 }, { unique: true });

// Consulta principal: "quem e membro desta casa".
MembershipSchema.index({ household: 1, role: 1 });

module.exports = mongoose.model('Membership', MembershipSchema);
