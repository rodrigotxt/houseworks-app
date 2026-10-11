// lib/domain/api/resources/occurrences.ts

import type { Transport } from '../client';
import { unwrap, unwrapPage } from '../client';
import type {
  CompleteOccurrenceRequest,
  Envelope,
  OccurrenceStatus,
  Page,
  SkipOccurrenceRequest,
  TaskExecution,
  TaskOccurrence,
} from '../types';

export interface ListOccurrencesQuery {
  from?: string;
  to?: string;
  status?: OccurrenceStatus;
  assignedTo?: string | 'unassigned';
  taskId?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface ListMyOccurrencesQuery extends Omit<ListOccurrencesQuery, 'assignedTo' | 'taskId'> {
  householdId?: string;
}

export function occurrencesResource(transport: Transport) {
  return {
    /** Agenda da casa ("Cronograma"). Sem from/to, a API usa hoje + horizonte. */
    list(householdId: string, query: ListOccurrencesQuery = {}): Promise<Page<TaskOccurrence>> {
      return transport
        .request<{ data: TaskOccurrence[]; meta: Page<TaskOccurrence>['meta'] }>(
          '/households/' + householdId + '/occurrences',
          { query }
        )
        .then(unwrapPage);
    },

    /** Minhas ocorrencias: designadas a mim ou ainda sem responsavel. */
    listMine(query: ListMyOccurrencesQuery = {}): Promise<Page<TaskOccurrence>> {
      return transport
        .request<{ data: TaskOccurrence[]; meta: Page<TaskOccurrence>['meta'] }>('/me/occurrences', {
          query,
        })
        .then(unwrapPage);
    },

    get(occurrenceId: string) {
      return transport
        .request<Envelope<TaskOccurrence>>('/occurrences/' + occurrenceId)
        .then(unwrap);
    },

    /** Concluir cria a execucao em pending_review e fecha a ocorrencia. */
    complete(occurrenceId: string, body: CompleteOccurrenceRequest = {}) {
      return transport
        .request<Envelope<{ occurrence: TaskOccurrence; execution: TaskExecution }>>(
          '/occurrences/' + occurrenceId + '/complete',
          { method: 'POST', body }
        )
        .then(unwrap);
    },

    skip(occurrenceId: string, body: SkipOccurrenceRequest = {}) {
      return transport
        .request<Envelope<TaskOccurrence>>('/occurrences/' + occurrenceId + '/skip', {
          method: 'POST',
          body,
        })
        .then(unwrap);
    },

    /** Desfaz a conclusao: apaga a execucao e devolve os pontos. */
    undo(occurrenceId: string) {
      return transport
        .request<Envelope<TaskOccurrence>>('/occurrences/' + occurrenceId + '/undo', {
          method: 'POST',
        })
        .then(unwrap);
    },

    executions(occurrenceId: string) {
      return transport
        .request<Envelope<TaskExecution[]>>('/occurrences/' + occurrenceId + '/executions')
        .then(unwrap);
    },
  };
}
