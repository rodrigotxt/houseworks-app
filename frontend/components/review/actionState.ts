// components/review/actionState.ts
// Estado do diálogo de avaliação. Mora fora de actions.ts porque um arquivo
// 'use server' só pode exportar funções assíncronas.

export interface RatingActionState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

export const EMPTY_RATING_ACTION: RatingActionState = { status: 'idle' };
