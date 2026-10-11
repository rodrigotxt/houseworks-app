// schemas/taskExecutionHistory.js
// Entrada de POST /tasks-executions e PATCH /tasks-executions/:taskExecutionId.

const { z } = require('zod');
const { objectId } = require('./common');

const note = z
  .string()
  .trim()
  .max(500, { message: 'A nota deve ter no maximo 500 caracteres.' });

const rating = z
  .number()
  .int({ message: 'A avaliacao deve ser um numero inteiro.' })
  .min(1, { message: 'A avaliacao minima e 1.' })
  .max(5, { message: 'A avaliacao maxima e 5.' });

const createExecutionSchema = z.strictObject({
  taskId: objectId,
  note: note.optional(),
  rating: rating.optional(),
});

const addNoteOrRatingSchema = z
  .strictObject({
    note: note.optional(),
    rating: rating.optional(),
  })
  .refine((value) => value.note !== undefined || value.rating !== undefined, {
    message: 'Informe ao menos nota ou avaliacao.',
  });

module.exports = { createExecutionSchema, addNoteOrRatingSchema };
