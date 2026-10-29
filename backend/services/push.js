// services/push.js
// Web Push (VAPID) — o transporte das notificacoes no PWA.
//
// Por que Web Push e nao um servico proprietario: e o padrao do navegador, e o app
// continua sendo um PWA instalavel, sem SDK de terceiro. O custo e que TODO envio
// depende de chaves VAPID configuradas no servidor — sem elas, o canal push fica
// indisponivel e o canal in_app continua funcionando. Nunca o contrario.
//
// Uma inscricao pertence ao APARELHO (model PushSubscription), nao a casa.

const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function privateKey() {
  return process.env.VAPID_PRIVATE_KEY || '';
}

function subject() {
  return process.env.VAPID_SUBJECT || 'mailto:contato@houseworks.local';
}

let configured = false;

function isConfigured() {
  return Boolean(publicKey() && privateKey());
}

function ensureConfigured() {
  if (!isConfigured()) return false;

  if (!configured) {
    webpush.setVapidDetails(subject(), publicKey(), privateKey());
    configured = true;
  }

  return true;
}

// Envia para UMA inscricao. Devolve { ok } ou { ok:false, gone:true } quando o
// navegador nao existe mais (404/410) — nesse caso a inscricao e removida, para a
// lista nao crescer com aparelhos que nunca mais vao receber nada.
async function sendToSubscription(subscription, payload) {
  if (!ensureConfigured()) {
    return { ok: false, skipped: true };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      payload,
      { TTL: 900 } // 15 min: um lembrete atrasado demais nao interessa.
    );

    return { ok: true };
  } catch (error) {
    const status = error.statusCode;

    if (status === 404 || status === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
      return { ok: false, gone: true };
    }

    return { ok: false, error: error.message };
  }
}

// Envia para todos os aparelhos de uma pessoa. O resultado e por PESSOA, e nao por
// aparelho: a entrega registra "enviado" se ao menos um aparelho recebeu.
async function sendToUser(userId, payload) {
  if (!isConfigured()) {
    return { status: 'skipped', reason: 'push_nao_configurado' };
  }

  const subscriptions = await PushSubscription.find({ user: userId });

  if (subscriptions.length === 0) {
    return { status: 'skipped', reason: 'sem_inscricao' };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const result = await sendToSubscription(subscription, payload);

    if (result.ok) {
      sent += 1;
    } else if (!result.gone) {
      failed += 1;
    }
  }

  if (sent > 0) {
    return { status: 'sent', sentAt: new Date() };
  }

  return { status: 'failed', reason: failed > 0 ? 'falha_no_envio' : 'sem_aparelho_ativo' };
}

module.exports = {
  isConfigured,
  publicKey,
  sendToSubscription,
  sendToUser,
};
