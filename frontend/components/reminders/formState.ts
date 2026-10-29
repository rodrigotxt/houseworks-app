// components/reminders/formState.ts
// O estado do formulário de lembrete.
//
// Mora fora de actions.ts de propósito: um arquivo 'use server' só pode exportar
// funções assíncronas.

export interface ReminderFormState {
  status: 'idle' | 'error';
  message?: string;
  /** Campo do formulário -> problema. As chaves usam o caminho do contrato. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_REMINDER_FORM: ReminderFormState = { status: 'idle' };

/** Estado das ações rápidas (feito, adiar, arquivar). */
export interface ReminderActionState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

export const EMPTY_REMINDER_ACTION: ReminderActionState = { status: 'idle' };
