// services/channels.js
// OS CANAIS de entrega de um lembrete, num registro so.
//
// O contrato ja nasce com quatro canais (in_app, push, email, sms) para nao precisar
// mudar quando os dois ultimos existirem. Implementados hoje: in_app e push.
//
// Cada canal diz se esta DISPONIVEL nesta instalacao. A criacao de um lembrete recusa
// canal indisponivel (CHANNEL_NOT_AVAILABLE) em vez de aceitar e falhar em silencio no
// disparo — o usuario precisa saber que aquele aviso nao vai sair.
//
// Para adicionar e-mail amanha: implementar send() e available() aqui, virar a flag e
// nao mexer em mais nada do dominio.

const push = require('./push');

const CHANNELS = {
  in_app: {
    available: () => true,
    // Nao ha envio externo: a propria ReminderDelivery E a notificacao.
    send: async () => ({ status: 'sent', sentAt: new Date() }),
  },

  push: {
    available: () => push.isConfigured(),
    send: async ({ reminder, userId }) => {
      const payload = JSON.stringify({
        title: reminder.title,
        body: reminder.notes || 'Lembrete da casa',
        reminderId: String(reminder._id),
        url: '/reminders',
        tag: 'reminder-' + String(reminder._id),
      });

      return push.sendToUser(userId, payload);
    },
  },

  email: {
    available: () => false,
    send: async () => ({ status: 'skipped', reason: 'canal_indisponivel' }),
  },

  sms: {
    available: () => false,
    send: async () => ({ status: 'skipped', reason: 'canal_indisponivel' }),
  },
};

function availableChannels() {
  return Object.keys(CHANNELS).filter((channel) => CHANNELS[channel].available());
}

function isAvailable(channel) {
  return Boolean(CHANNELS[channel] && CHANNELS[channel].available());
}

// Executa os canais de UMA entrega. Um canal que falha nao derruba os outros: o
// in_app sempre chega, mesmo quando o push do aparelho esta morto.
async function sendThroughChannels(channels, context) {
  const results = [];

  for (const channel of channels) {
    const adapter = CHANNELS[channel];

    if (!adapter || !adapter.available()) {
      results.push({ channel, status: 'skipped', reason: 'canal_indisponivel' });
      continue;
    }

    try {
      const outcome = await adapter.send(context);
      results.push(Object.assign({ channel }, outcome));
    } catch (error) {
      results.push({ channel, status: 'failed', reason: error.message });
    }
  }

  return results;
}

module.exports = {
  availableChannels,
  isAvailable,
  sendThroughChannels,
};
