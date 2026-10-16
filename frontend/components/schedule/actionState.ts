// components/schedule/actionState.ts
// Fora de actions.ts de propósito: arquivo 'use server' só exporta função assíncrona.

export interface OccurrenceActionState {
  /**
   * `idle` é o valor INICIAL; `ok` é o SUCESSO.
   *
   * A distinção existe porque o diálogo precisa fechar depois de concluir, e sem ela não há
   * como saber se a ação já rodou: `idle` significaria as duas coisas ao mesmo tempo.
   */
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

export const EMPTY_OCCURRENCE_ACTION: OccurrenceActionState = { status: 'idle' };
