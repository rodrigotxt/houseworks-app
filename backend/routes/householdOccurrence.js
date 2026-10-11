// routes/householdOccurrence.js
// Agenda DENTRO de uma casa. Montado por routes/household.js em
// /households/:householdId/occurrences.

const express = require('express');
const router = express.Router({ mergeParams: true });

const occurrenceController = require('../controllers/occurrenceController');
const { requireAuth } = require('../middlewares/auth');
const { requireMember } = require('../middlewares/membership');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { listOccurrencesQuerySchema } = require('../schemas/occurrence');

// @route   GET /households/:householdId/occurrences
// @desc    Agenda da casa ("Cronograma")
// @access  Membro da casa
router.get(
  '/',
  requireAuth,
  requireMember,
  validate({ query: listOccurrencesQuerySchema }),
  asyncHandler(occurrenceController.listByHousehold)
);

module.exports = router;
