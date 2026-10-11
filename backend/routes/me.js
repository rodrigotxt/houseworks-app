// routes/me.js
// Rotas do usuario autenticado, sem casa no caminho.

const express = require('express');
const router = express.Router();

const occurrenceController = require('../controllers/occurrenceController');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { listMyOccurrencesQuerySchema } = require('../schemas/occurrence');

// @route   GET /me/occurrences
// @desc    Minha agenda (designadas a mim ou sem responsavel)
// @access  Privado
router.get(
  '/occurrences',
  requireAuth,
  validate({ query: listMyOccurrencesQuerySchema }),
  asyncHandler(occurrenceController.listMine)
);

module.exports = router;
