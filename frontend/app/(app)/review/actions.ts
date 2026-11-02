// app/(app)/review/actions.ts
// Avaliar a execução de outro membro — a conferência que fecha o ciclo da tarefa.
//
// Server Action, como o resto do app: a API valida de novo (inclusive "não avalie a
// própria execução" e a janela), e o cliente só decide o que mostrar.

'use server';

import { revalidatePath } from 'next/cache';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { serverApi } from '@/lib/session/server';
import type { RatingActionState } from '@/components/review/actionState';

export async function rateExecution(
  executionId: string,
  _anterior: RatingActionState,
  formData: FormData
): Promise<RatingActionState> {
  const nota = Number(formData.get('rating'));

  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return { status: 'error', message: 'Escolha uma nota de 1 a 5.' };
  }

  const texto = formData.get('note');
  const note = typeof texto === 'string' && texto.trim() !== '' ? texto.trim() : undefined;

  try {
    await (await serverApi()).executions.rate(executionId, { rating: nota, note });
  } catch (causa) {
    if (isApiError(causa)) {
      return { status: 'error', message: messageFor(causa.code, causa.message) };
    }

    return { status: 'error', message: 'Não conseguimos falar com o servidor.' };
  }

  // A nota muda a fila, o placar e a média do membro.
  revalidatePath('/review');
  revalidatePath('/performance');

  return { status: 'ok' };
}
