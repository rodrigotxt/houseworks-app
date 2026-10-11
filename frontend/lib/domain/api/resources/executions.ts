// lib/domain/api/resources/executions.ts

import type { Transport } from '../client';
import { unwrap, unwrapPage } from '../client';
import type {
  Envelope,
  ExecutionStatus,
  Page,
  RateExecutionRequest,
  TaskExecution,
} from '../types';

export interface ListExecutionsQuery {
  from?: string;
  to?: string;
  status?: ExecutionStatus;
  executedBy?: string;
  /** Fila de conferencia: o que ainda posso avaliar. */
  pendingReviewForMe?: boolean;
  page?: number;
  pageSize?: number;
}

export function executionsResource(transport: Transport) {
  return {
    list(householdId: string, query: ListExecutionsQuery = {}): Promise<Page<TaskExecution>> {
      return transport
        .request<{ data: TaskExecution[]; meta: Page<TaskExecution>['meta'] }>(
          '/households/' + householdId + '/executions',
          { query }
        )
        .then(unwrapPage);
    },

    get(executionId: string) {
      return transport
        .request<Envelope<TaskExecution>>('/executions/' + executionId)
        .then(unwrap);
    },

    /** Quem executou NUNCA avalia a propria execucao — a API recusa. */
    rate(executionId: string, body: RateExecutionRequest) {
      return transport
        .request<Envelope<TaskExecution>>('/executions/' + executionId + '/rating', {
          method: 'PATCH',
          body,
        })
        .then(unwrap);
    },
  };
}
