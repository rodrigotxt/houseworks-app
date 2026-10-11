// lib/domain/api/resources/tasks.ts

import type { Transport } from '../client';
import { unwrap, unwrapPage } from '../client';
import type {
  CreateTaskRequest,
  Difficulty,
  Envelope,
  Frequency,
  Page,
  Task,
  TaskOccurrence,
  UpdateTaskRequest,
} from '../types';

export interface ListTasksQuery {
  status?: 'active' | 'archived';
  assignedTo?: string | 'unassigned';
  frequency?: Frequency;
  difficulty?: Difficulty;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface ListOccurrencesOfTaskQuery {
  from?: string;
  to?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function tasksResource(transport: Transport) {
  return {
    list(householdId: string, query: ListTasksQuery = {}): Promise<Page<Task>> {
      return transport
        .request<{ data: Task[]; meta: Page<Task>['meta'] }>(
          '/households/' + householdId + '/tasks',
          { query }
        )
        .then(unwrapPage);
    },

    create(householdId: string, body: CreateTaskRequest) {
      return transport
        .request<Envelope<Task>>('/households/' + householdId + '/tasks', { method: 'POST', body })
        .then(unwrap);
    },

    get(taskId: string) {
      return transport.request<Envelope<Task>>('/tasks/' + taskId).then(unwrap);
    },

    update(taskId: string, body: UpdateTaskRequest) {
      return transport
        .request<Envelope<Task>>('/tasks/' + taskId, { method: 'PATCH', body })
        .then(unwrap);
    },

    /** Sem hard, ARQUIVA — o historico e o placar sobrevivem. */
    archive(taskId: string) {
      return transport.request<void>('/tasks/' + taskId, { method: 'DELETE' });
    },

    /** Com hard, exclui de vez. Exige papel owner. */
    destroy(taskId: string) {
      return transport.request<void>('/tasks/' + taskId, {
        method: 'DELETE',
        query: { hard: 'true' },
      });
    },

    occurrences(taskId: string, query: ListOccurrencesOfTaskQuery = {}) {
      return transport
        .request<{ data: TaskOccurrence[]; meta: Page<TaskOccurrence>['meta'] }>(
          '/tasks/' + taskId + '/occurrences',
          { query }
        )
        .then(unwrapPage);
    },
  };
}
