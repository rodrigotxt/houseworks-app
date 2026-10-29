// routes/push.js
// Web Push do usuario. Montado por routes/me.js em /me/push.

const express = require('express');
const router = express.Router();

const pushController = require('../controllers/pushController');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const {
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} = require('../schemas/reminder');

// @route   GET /me/push/config
// @desc    Chave publica VAPID e se o push esta habilitado
// @access  Privado
router.get('/config', requireAuth, asyncHandler(pushController.config));

// @route   GET /me/push/subscriptions
// @desc    Meus aparelhos inscritos
// @access  Privado
router.get('/subscriptions', requireAuth, asyncHandler(pushController.list));

// @route   POST /me/push/subscriptions
// @desc    Inscrever este aparelho
// @access  Privado
router.post(
  '/subscriptions',
  requireAuth,
  validate({ body: pushSubscriptionSchema }),
  asyncHandler(pushController.subscribe)
);

// @route   DELETE /me/push/subscriptions
// @desc    Remover a inscricao deste aparelho (identificada pelo endpoint)
// @access  Privado
router.delete(
  '/subscriptions',
  requireAuth,
  validate({ body: pushUnsubscribeSchema }),
  asyncHandler(pushController.unsubscribe)
);

module.exports = router;
