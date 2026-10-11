// schemas/execution.js
// Entrada das rotas de execucao.

const { z } = require('zod');
const { objectId } = require('./common');
const { STATUSES } = require('../models/TaskExecution');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato AAAA-MM-DD.' });

// z.coerce.boolean() converteria a string "false" em true — armadilha classica de
// query string. Por isso a uniao explicita.
const booleanQuery = z
  .union([z.literal('true'), z.literal('false')], { message: 'Use true ou false.' })
  .transform((value) => value === 'true');

// A avaliacao e obrigatoria: e ela que encerra a execucao.
const rateExecutionSchema = z.strictObject({
  rating: z
    .number()
    .int({ message: 'A avaliacao deve ser um numero inteiro.' })
    .min(1, { message: 'A avaliacao minima e 1.' })
    .max(5, { message: 'A avaliacao maxima e 5.' }),
  note: z
    .string()
    .trim()
    .max(500, { message: 'A nota da avaliacao deve ter no maximo 500 caracteres.' })
    .optional(),
});

const listExecutionsQuerySchema = z
  .strictObject({
    from: dateString.optional(),
    to: dateString.optional(),
    status: z
      .enum(STATUSES, {
        message: 'O status deve ser pending_review, approved ou auto_approved.',
      })
      .optional(),
    executedBy: objectId.optional(),
    // Fila de conferencia: o que o usuario autenticado ainda pode avaliar.
    pendingReviewForMe: booleanQuery.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'A data inicial nao pode ser posterior a final.',
    path: ['from'],
  });

module.exports = { rateExecutionSchema, listExecutionsQuerySchema, booleanQuery };
