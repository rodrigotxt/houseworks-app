// components/tasks/formState.ts
// O estado do formulário de tarefa.
//
// Mora FORA de actions.ts de propósito: um arquivo com 'use server' só pode exportar
// funções assíncronas, e uma constante exportada ali quebra o build ("A 'use server'
// file can only export async functions, found object").
//
// O tipo tambem fica aqui para o formulário não precisar importar do arquivo de ações —
// assim o cliente não puxa nada de servidor só para conhecer o formato do estado.

export interface TaskFormState {
  status: 'idle' | 'error';
  message?: string;
  /** Campo -> problema. As chaves usam o mesmo nome dos campos do formulário. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_TASK_FORM: TaskFormState = { status: 'idle' };
