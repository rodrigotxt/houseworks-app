// schemas/occurrence.js
// Entrada das rotas de agenda.

const { z } = require('zod');
const { objectId } = require('./common');
const { STATUSES } = require('../models/TaskOccurrence');
const { dateString } = require('./task');

const status = z.enum(STATUSES, {
  message: 'O status deve ser pending, done, overdue ou skipped.',
});

const window = {
  from: dateString.optional(),
  to: dateString.optional(),
  sort: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

function orderedWindow(value) {
  return !value.from || !value.to || value.from <= value.to;
}

const ORDER_MESSAGE = { message: 'A data inicial nao pode ser posterior a final.', path: ['from'] };

const listOccurrencesQuerySchema = z
  .strictObject(
    Object.assign({}, window, {
      status: status.optional(),
      assignedTo: z.union([z.literal('unassigned'), objectId]).optional(),
      taskId: objectId.optional(),
    })
  )
  .refine(orderedWindow, ORDER_MESSAGE);

const listMyOccurrencesQuerySchema = z
  .strictObject(
    Object.assign({}, window, {
      status: status.optional(),
      householdId: objectId.optional(),
    })
  )
  .refine(orderedWindow, ORDER_MESSAGE);

const listTaskOccurrencesQuerySchema = z
  .strictObject(Object.assign({}, window, { status: status.optional() }))
  .refine(orderedWindow, ORDER_MESSAGE);

// Corpo opcional: concluir sem corpo nenhum e o caso comum.
// O .default({}) existe porque req.body chega undefined quando nao ha corpo.
const completeOccurrenceSchema = z
  .strictObject({
    note: z
      .string()
      .trim()
      .max(500, { message: 'A nota deve ter no maximo 500 caracteres.' })
      .optional(),
    // Registro retroativo de quem esqueceu de marcar (limite em services/executions.js).
    completionDate: z.coerce.date({ message: 'Data de conclusao invalida.' }).optional(),
    // Opcional: em branco, vale a estimativa da tarefa. Zero e um valor legitimo
    // (tarefa que levou menos de um minuto), por isso min(0) e nao min(1).
    actualMinutes: z
      .number()
      .int({ message: 'O tempo real deve ser um numero inteiro de minutos.' })
      .min(0, { message: 'O tempo real nao pode ser negativo.' })
      .max(1440, { message: 'O tempo real deve ser no maximo 1440 minutos (24 horas).' })
      .optional(),
  })
  .default({});

const skipOccurrenceSchema = z
  .strictObject({
    reason: z
      .string()
      .trim()
      .max(300, { message: 'O motivo deve ter no maximo 300 caracteres.' })
      .optional(),
  })
  .default({});

module.exports = {
  listOccurrencesQuerySchema,
  listMyOccurrencesQuerySchema,
  listTaskOccurrencesQuerySchema,
  completeOccurrenceSchema,
  skipOccurrenceSchema,
};
