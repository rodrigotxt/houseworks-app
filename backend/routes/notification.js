// routes/notification.js
// Caixa de notificacoes do usuario. Montado por routes/me.js em /me/notifications.

const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { listNotificationsQuerySchema } = require('../schemas/reminder');

// @route   GET /me/notifications
// @desc    Minhas notificacoes (o que ja disparou para mim)
// @access  Privado
router.get(
  '/',
  requireAuth,
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(notificationController.list)
);

// @route   POST /me/notifications/:deliveryId/read
// @desc    Marcar como lida
// @access  Dono da notificacao
router.post(
  '/:deliveryId/read',
  requireAuth,
  asyncHandler(notificationController.markRead)
);

module.exports = router;
