// lib/domain/api/resources/reminders.ts

import type { Transport } from '../client';
import { unwrap, unwrapPage } from '../client';
import type {
  CreateReminderRequest,
  Envelope,
  Page,
  Reminder,
  ReminderFiring,
  ReminderNotification,
  UpdateReminderRequest,
} from '../types';

export interface ListRemindersQuery {
  status?: 'active' | 'paused' | 'archived' | 'all';
  recipient?: string;
  task?: string;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function remindersResource(transport: Transport) {
  return {
    list(householdId: string, query: ListRemindersQuery = {}): Promise<Page<Reminder>> {
      return transport
        .request<{ data: Reminder[]; meta: Page<Reminder>['meta'] }>(
          '/households/' + householdId + '/reminders',
          { query }
        )
        .then(unwrapPage);
    },

    create(householdId: string, body: CreateReminderRequest) {
      return transport
        .request<Envelope<Reminder>>('/households/' + householdId + '/reminders', {
          method: 'POST',
          body,
        })
        .then(unwrap);
    },

    get(reminderId: string) {
      return transport.request<Envelope<Reminder>>('/reminders/' + reminderId).then(unwrap);
    },

    update(reminderId: string, body: UpdateReminderRequest) {
      return transport
        .request<Envelope<Reminder>>('/reminders/' + reminderId, { method: 'PATCH', body })
        .then(unwrap);
    },

    /** Sem hard, ARQUIVA — o histórico de notificações continua. */
    archive(reminderId: string) {
      return transport.request<void>('/reminders/' + reminderId, { method: 'DELETE' });
    },

    /** Com hard, exclui de vez. Exige papel owner. */
    destroy(reminderId: string) {
      return transport.request<void>('/reminders/' + reminderId, {
        method: 'DELETE',
        query: { hard: 'true' },
      });
    },

    /** "Feito": resolve a última notificação deste lembrete para mim. */
    acknowledge(reminderId: string) {
      return transport
        .request<Envelope<ReminderNotification>>('/reminders/' + reminderId + '/ack', {
          method: 'POST',
        })
        .then(unwrap);
    },

    /** Adia só para mim, daqui a N minutos. */
    snooze(reminderId: string, minutes: number) {
      return transport
        .request<Envelope<ReminderFiring>>('/reminders/' + reminderId + '/snooze', {
          method: 'POST',
          body: { minutes },
        })
        .then(unwrap);
    },
  };
}
