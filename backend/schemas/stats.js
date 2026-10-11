// schemas/stats.js
// Entrada das rotas de desempenho.

const { z } = require('zod');
const { objectId } = require('./common');
const { dateString } = require('./task');

const PERIODS = ['week', 'month', 'all'];

const period = z.enum(PERIODS, {
  message: 'O periodo deve ser week, month ou all.',
});

function ordered(value) {
  return !value.from || !value.to || value.from <= value.to;
}

const ORDER = { message: 'A data inicial nao pode ser posterior a final.', path: ['from'] };

const statsQuerySchema = z
  .strictObject({ from: dateString.optional(), to: dateString.optional() })
  .refine(ordered, ORDER);

const leaderboardQuerySchema = z
  .strictObject({
    period: period.optional(),
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .refine(ordered, ORDER);

const scoreQuerySchema = z
  .strictObject({
    householdId: objectId,
    period: period.optional(),
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .refine(ordered, ORDER);

module.exports = { PERIODS, statsQuerySchema, leaderboardQuerySchema, scoreQuerySchema };
