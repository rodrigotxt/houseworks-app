// lib/domain/api/resources/notifications.ts

import type { Transport } from '../client';
import { unwrap, unwrapPage } from '../client';
import type { Envelope, Page, ReminderNotification } from '../types';

export interface ListNotificationsQuery {
  unread?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export function notificationsResource(transport: Transport) {
  return {
    /** O que os lembretes já dispararam para mim, mais novo primeiro. */
    list(query: ListNotificationsQuery = {}): Promise<Page<ReminderNotification>> {
      return transport
        .request<{ data: ReminderNotification[]; meta: Page<ReminderNotification>['meta'] }>(
          '/me/notifications',
          { query }
        )
        .then(unwrapPage);
    },

    markRead(deliveryId: string) {
      return transport
        .request<Envelope<ReminderNotification>>('/me/notifications/' + deliveryId + '/read', {
          method: 'POST',
        })
        .then(unwrap);
    },
  };
}
