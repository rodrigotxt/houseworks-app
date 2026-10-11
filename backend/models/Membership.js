// models/Membership.js
// Vinculo entre um usuario e uma casa. E aqui que mora a autorizacao.
//
// Guarda o papel e sobreposicoes opcionais; as capacidades efetivas sao derivadas
// (utils/capabilities.js) e expostas como virtual "capabilities".

const mongoose = require('mongoose');
const { createJsonOptions } = require('../config/serialization');
const { ROLES, resolveCapabilities } = require('../utils/capabilities');

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
