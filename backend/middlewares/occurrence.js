// middlewares/occurrence.js
// Mesma logica de task/execution: o escopo vem do recurso e quem nao e membro da
// casa recebe 404 em vez de 403.

const TaskOccurrence = require('../models/TaskOccurrence');
const Membership = require('../models/Membership');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const asyncHandler = require('../utils/asyncHandler');

async function loadOccurrence(req, res, next) {
  const occurrence = await TaskOccurrence.findById(req.params.occurrenceId);

  if (!occurrence) {
    throw ApiError.notFound('Ocorrencia nao encontrada.', ErrorCode.OCCURRENCE_NOT_FOUND);
  }

  const membership = await Membership.findOne({
    household: occurrence.household,
    user: req.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Ocorrencia nao encontrada.', ErrorCode.OCCURRENCE_NOT_FOUND);
  }

  req.occurrence = occurrence;
  req.membership = membership;

  return next();
}

module.exports = { loadOccurrence: asyncHandler(loadOccurrence) };
