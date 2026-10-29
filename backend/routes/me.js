// routes/me.js
// Rotas do usuario autenticado, sem casa no caminho.

const express = require('express');
const router = express.Router();

const occurrenceController = require('../controllers/occurrenceController');
const statsController = require('../controllers/statsController');
const notificationRoutes = require('./notification');
const pushRoutes = require('./push');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { listMyOccurrencesQuerySchema } = require('../schemas/occurrence');
const { scoreQuerySchema } = require('../schemas/stats');

// @route   GET /me/occurrences
// @desc    Minha agenda (designadas a mim ou sem responsavel)
// @access  Privado
router.get(
  '/occurrences',
  requireAuth,
  validate({ query: listMyOccurrencesQuerySchema }),
  asyncHandler(occurrenceController.listMine)
);

// @route   GET /me/score
// @desc    Minha pontuacao e posicao numa casa
// @access  Privado
router.get(
  '/score',
  requireAuth,
  validate({ query: scoreQuerySchema }),
  asyncHandler(statsController.myScore)
);

// Notificacoes (lembretes que ja dispararam) e inscricoes de Web Push.
router.use('/notifications', notificationRoutes);
router.use('/push', pushRoutes);

module.exports = router;
