// controllers/pushController.js
// Inscricoes de Web Push do usuario autenticado.
//
// O navegador e quem gera endpoint e chaves (PushManager.subscribe); a API so guarda.
// Sem chaves VAPID configuradas no servidor, o canal push fica indisponivel e estas
// rotas respondem 400 CHANNEL_NOT_AVAILABLE — nunca aceitam uma inscricao que nunca
// poderia ser usada.

const PushSubscription = require('../models/PushSubscription');
const push = require('../services/push');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, noContent } = require('../utils/respond');

// @desc    Configuracao de push para o navegador (chave publica VAPID)
// @route   GET /api/v1/me/push/config
// @access  Privado
exports.config = async (req, res) => {
  const enabled = push.isConfigured();

  return ok(res, {
    enabled,
    publicKey: enabled ? push.publicKey() : null,
  });
};

// @desc    Meus aparelhos inscritos
// @route   GET /api/v1/me/push/subscriptions
// @access  Privado
exports.list = async (req, res) => {
  const subscriptions = await PushSubscription.find({ user: req.userId }).sort({
    createdAt: -1,
  });

  return ok(res, subscriptions);
};

// @desc    Inscrever este aparelho
// @route   POST /api/v1/me/push/subscriptions
// @access  Privado
exports.subscribe = async (req, res) => {
  if (!push.isConfigured()) {
    throw new ApiError(
      400,
      ErrorCode.PUSH_NOT_CONFIGURED,
      'O push nao esta configurado neste servidor.',
      [{ field: 'push', issue: 'Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.' }]
    );
  }

  const { endpoint, keys, userAgent } = req.body;

  const existing = await PushSubscription.findOne({ endpoint });

  if (existing) {
    // O mesmo navegador pode ter trocado de conta: a inscricao passa a ser do novo
    // usuario, em vez de ficar presa a quem saiu.
    existing.user = req.userId;
    existing.keys = { p256dh: keys.p256dh, auth: keys.auth };
    existing.userAgent = userAgent || existing.userAgent;
    existing.lastSeenAt = new Date();
    await existing.save();

    return ok(res, existing);
  }

  const subscription = await new PushSubscription({
    user: req.userId,
    endpoint,
    keys,
    userAgent,
  }).save();

  return created(res, subscription);
};

// @desc    Remover a inscricao deste aparelho
// @route   DELETE /api/v1/me/push/subscriptions
// @access  Privado
exports.unsubscribe = async (req, res) => {
  await PushSubscription.deleteOne({
    user: req.userId,
    endpoint: req.body.endpoint,
  });

  return noContent(res);
};
