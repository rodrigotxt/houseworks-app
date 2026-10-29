// controllers/notificationController.js
// A caixa de notificacoes do usuario autenticado.
//
// Uma ReminderDelivery e criada no disparo, para cada destinatario. A caixa mostra o
// que ja disparou; o que ainda VAI disparar fica no lembrete (nextFireAt), nao aqui.
//
// "Lido" e "feito" sao coisas diferentes de proposito: ler e so abrir; feito e
// resolver. O remedio das 21h continua valendo amanha, entao "feito" nao interrompe
// a recorrencia.

const ReminderDelivery = require('../models/ReminderDelivery');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, pageMeta } = require('../utils/respond');
const { skipFor } = require('../utils/pagination');

const DELIVERY_POPULATE = {
  path: 'reminder',
  select: 'title notes schedule channels status',
};

// @desc    Minhas notificacoes
// @route   GET /api/v1/me/notifications
// @access  Privado
exports.list = async (req, res) => {
  const { unread, page, pageSize } = req.validatedQuery;

  const filter = { user: req.userId };

  if (unread === 'true') filter.readAt = null;
  if (unread === 'false') filter.readAt = { $ne: null };

  const [items, total] = await Promise.all([
    ReminderDelivery.find(filter)
      .populate(DELIVERY_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skipFor(page, pageSize))
      .limit(pageSize),
    ReminderDelivery.countDocuments(filter),
  ]);

  return ok(res, items, pageMeta(page, pageSize, total));
};

// @desc    Marcar uma notificacao como lida
// @route   POST /api/v1/me/notifications/:deliveryId/read
// @access  Dono da notificacao
exports.markRead = async (req, res) => {
  const delivery = await ReminderDelivery.findOne({
    _id: req.params.deliveryId,
    user: req.userId,
  });

  if (!delivery) {
    throw ApiError.notFound(
      'Notificacao nao encontrada.',
      ErrorCode.DELIVERY_NOT_FOUND
    );
  }

  if (!delivery.readAt) {
    delivery.readAt = new Date();
    await delivery.save();
  }

  await delivery.populate(DELIVERY_POPULATE);

  return ok(res, delivery);
};
