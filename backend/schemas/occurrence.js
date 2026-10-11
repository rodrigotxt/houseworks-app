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

module.exports = {
  listOccurrencesQuerySchema,
  listMyOccurrencesQuerySchema,
  listTaskOccurrencesQuerySchema,
};
