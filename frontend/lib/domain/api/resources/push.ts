// lib/domain/api/resources/push.ts

import type { Transport } from '../client';
import { unwrap } from '../client';
import type {
  CreatePushSubscriptionRequest,
  Envelope,
  PushConfig,
  PushSubscription,
} from '../types';

export function pushResource(transport: Transport) {
  return {
    /** Diz se o servidor tem VAPID e devolve a chave pública para o navegador. */
    config() {
      return transport.request<Envelope<PushConfig>>('/me/push/config').then(unwrap);
    },

    list() {
      return transport
        .request<Envelope<PushSubscription[]>>('/me/push/subscriptions')
        .then(unwrap);
    },

    subscribe(body: CreatePushSubscriptionRequest) {
      return transport
        .request<Envelope<PushSubscription>>('/me/push/subscriptions', {
          method: 'POST',
          body,
        })
        .then(unwrap);
    },

    /** O aparelho é identificado pelo endpoint; idempotente. */
    unsubscribe(endpoint: string) {
      return transport.request<void>('/me/push/subscriptions', {
        method: 'DELETE',
        body: { endpoint },
      });
    },
  };
}
