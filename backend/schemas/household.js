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
  })
  .refine((value) => value.role !== undefined || value.capabilities !== undefined, {
    message: 'Informe papel ou capacidades.',
  });

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
