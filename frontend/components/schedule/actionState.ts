// components/schedule/actionState.ts
// Fora de actions.ts de propósito: arquivo 'use server' só exporta função assíncrona.

export interface OccurrenceActionState {
  status: 'idle' | 'error';
  message?: string;
}

export const EMPTY_OCCURRENCE_ACTION: OccurrenceActionState = { status: 'idle' };
