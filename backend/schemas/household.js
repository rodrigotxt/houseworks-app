// schemas/household.js
// Entrada das rotas de casa, convite e membros (docs/openapi.yaml).

const { z } = require('zod');
const { email, personName, username, password } = require('./common');

const name = z
  .string()
  .trim()
  .min(2, { message: 'O nome da casa deve ter no minimo 2 caracteres.' })
  .max(80, { message: 'O nome da casa deve ter no maximo 80 caracteres.' });

const timezone = z
  .string()
  .trim()
  .min(1, { message: 'Fuso horario invalido.' })
  .max(64, { message: 'Fuso horario invalido.' });

const ratingWindowHours = z
  .number()
  .int({ message: 'A janela de avaliacao deve ser um numero inteiro de horas.' })
  .min(1, { message: 'A janela de avaliacao minima e 1 hora.' })
  .max(720, { message: 'A janela de avaliacao maxima e 720 horas.' });

const horizonDays = z
  .number()
  .int({ message: 'O horizonte deve ser um numero inteiro de dias.' })
  .min(1, { message: 'O horizonte minimo e 1 dia.' })
  .max(365, { message: 'O horizonte maximo e 365 dias.' });

const createHouseholdSchema = z.strictObject({
  name,
  timezone: timezone.optional(),
  ratingWindowHours: ratingWindowHours.optional(),
  horizonDays: horizonDays.optional(),
});

const updateHouseholdSchema = z
  .strictObject({
    name: name.optional(),
    timezone: timezone.optional(),
    ratingWindowHours: ratingWindowHours.optional(),
    horizonDays: horizonDays.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

const joinHouseholdSchema = z.strictObject({
  inviteCode: z
    .string()
    .trim()
    .min(4, { message: 'Codigo de convite invalido.' })
    .max(32, { message: 'Codigo de convite invalido.' }),
  // owner nao pode ser auto-atribuido no ingresso.
  role: z.enum(['adult', 'child'], { message: 'O papel deve ser adult ou child.' }).optional(),
});

// Tempo livre da pessoa. Sem valor padrao aqui: quem decide o de-verdade e o
// documento, e o contrato nao deve passar a exigir o campo.
const freeTimeMinutes = z
  .number()
  .int({ message: 'O tempo livre deve ser um numero inteiro de minutos.' })
  .min(0, { message: 'O tempo livre nao pode ser negativo.' })
  .max(1440, { message: 'O tempo livre deve ser no maximo 1440 minutos (24 horas).' });

const freeTime = z
  .strictObject({
    mode: z.enum(['fixo', 'por_dia'], {
      message: 'O modo do tempo livre deve ser fixo ou por_dia.',
    }),
    fixedMinutes: freeTimeMinutes.nullable().optional(),
    byWeekday: z
      .array(freeTimeMinutes)
      .length(7, { message: 'O tempo livre por dia precisa de 7 posicoes (domingo a sabado).' })
      .optional(),
  })
  .refine((value) => value.mode !== 'fixo' || value.fixedMinutes != null, {
    message: 'No modo fixo, informe fixedMinutes.',
    path: ['fixedMinutes'],
  })
  .refine((value) => value.mode !== 'por_dia' || value.byWeekday !== undefined, {
    message: 'No modo por dia, informe os 7 dias.',
    path: ['byWeekday'],
  });

const updateMemberSchema = z
  .strictObject({
    role: z.enum(['owner', 'adult', 'child'], {
      message: 'O papel deve ser owner, adult ou child.',
    }).optional(),
    capabilities: z
      .strictObject({
        canAssign: z.boolean().optional(),
        canRate: z.boolean().optional(),
        canManageTasks: z.boolean().optional(),
        canManageMembers: z.boolean().optional(),
      })
      .optional(),
    // null LIMPA: volta a "nunca configurado", que e diferente de zero.
    freeTime: freeTime.nullable().optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined || value.capabilities !== undefined || value.freeTime !== undefined,
    { message: 'Informe papel, capacidades ou tempo livre.' }
  );

// Cadastro de uma pessoa nova feito pelo dono da casa: cria o usuario E a membership
// numa chamada so. Nao cria casa nenhuma (diferente de POST /auth/register).
const createMemberSchema = z.strictObject({
  name: personName,
  username,
  email,
  password,
  // Sem valor padrao AQUI: quem decide o padrao (child) e o controller, para o contrato
  // nao passar a exigir o campo.
  role: z.enum(['owner', 'adult', 'child'], {
    message: 'O papel deve ser owner, adult ou child.',
  }).optional(),
});

module.exports = {
  createHouseholdSchema,
  updateHouseholdSchema,
  joinHouseholdSchema,
  updateMemberSchema,
  createMemberSchema,
};
