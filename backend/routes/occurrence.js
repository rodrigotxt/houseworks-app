// routes/occurrence.js

const express = require('express');
const router = express.Router();

const occurrenceController = require('../controllers/occurrenceController');
const { requireAuth } = require('../middlewares/auth');
const { loadOccurrence } = require('../middlewares/occurrence');
const asyncHandler = require('../utils/asyncHandler');

// @route   GET /occurrences/:occurrenceId
// @desc    Detalhe da ocorrencia
// @access  Membro da casa da ocorrencia
router.get(
  '/:occurrenceId',
  requireAuth,
  loadOccurrence,
  asyncHandler(occurrenceController.getById)
);

module.exports = router;
