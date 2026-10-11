// app/(app)/schedule/actions.ts
// Concluir, pular e desfazer — o uso diário da casa.
//
// Mesmo padrão das tarefas: Server Action, e não fetch no browser. Aqui isso importa
// ainda mais: concluir é o gesto mais repetido do app, e cada clique precisa atualizar a
// agenda e o placar sem o cliente ter que orquestrar isso.

'use server';

import { revalidatePath } from 'next/cache';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { serverApi } from '@/lib/session/server';
import type { OccurrenceActionState } from '@/components/schedule/actionState';

/**
 * Tudo que muda uma ocorrência mexe em três telas: a agenda, a lista de tarefas (que
 * guarda a última conclusão) e o placar. Revalidar as três aqui evita o usuário ver
 * número velho depois de concluir.
 */
function revalidarTudo() {
  revalidatePath('/schedule');
  revalidatePath('/tasks');
  revalidatePath('/performance');
}

function falha(causa: unknown): OccurrenceActionState {
  if (isApiError(causa)) {
    return { status: 'error', message: messageFor(causa.code, causa.message) };
  }

  return { status: 'error', message: 'Não conseguimos falar com o servidor.' };
}

export async function completeOccurrence(
  occurrenceId: string,
  _anterior: OccurrenceActionState,
  formData: FormData
): Promise<OccurrenceActionState> {
  const nota = formData.get('note');
  const note = typeof nota === 'string' && nota.trim() !== '' ? nota.trim() : undefined;

  try {
    await (await serverApi()).occurrences.complete(occurrenceId, { note });
  } catch (causa) {
    // 409 aqui é comum e não é defeito: alguém da casa marcou antes. Não redirecionamos
    // nem recarregamos — a mensagem explica, e a próxima navegação traz o estado novo.
    return falha(causa);
  }

  revalidarTudo();
  return { status: 'idle' };
}

export async function skipOccurrence(
  occurrenceId: string,
  _anterior: OccurrenceActionState,
  formData: FormData
): Promise<OccurrenceActionState> {
  const motivo = formData.get('reason');
  const reason = typeof motivo === 'string' && motivo.trim() !== '' ? motivo.trim() : undefined;

  try {
    await (await serverApi()).occurrences.skip(occurrenceId, { reason });
  } catch (causa) {
    return falha(causa);
  }

  revalidarTudo();
  return { status: 'idle' };
}

export async function undoOccurrence(
  occurrenceId: string,
  _anterior: OccurrenceActionState
): Promise<OccurrenceActionState> {
  try {
    await (await serverApi()).occurrences.undo(occurrenceId);
  } catch (causa) {
    return falha(causa);
  }

  revalidarTudo();
  return { status: 'idle' };
}
