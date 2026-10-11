// schemas/execution.js
// Entrada das rotas de execucao.

const { z } = require('zod');
const { objectId } = require('./common');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato AAAA-MM-DD.' });

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
    executedBy: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'A data inicial nao pode ser posterior a final.',
  });

module.exports = { rateExecutionSchema, listExecutionsQuerySchema };
