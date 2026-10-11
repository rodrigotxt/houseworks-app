// app/(app)/tasks/actions.ts
// As mutações de tarefa.
//
// POR QUE SERVER ACTION, e não fetch no browser:
//   1. a sessão já está no servidor (o cookie é repassado), então não há nada a montar;
//   2. a revalidação é nativa (revalidatePath), sem router.refresh() espalhado;
//   3. o formulário funciona sem JavaScript.
//
// O LOGIN é a exceção e continua no browser: lá o cookie é gravado pela PRÓPRIA API na
// resposta, e repetir isso aqui seria duplicar a lógica de httpOnly/maxAge/SameSite.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError, isApiError } from '@/lib/domain/api';
import type { CreateTaskRequest, UpdateTaskRequest } from '@/lib/domain/api/types';
import { messageFor } from '@/lib/domain/labels';
import { serverApi } from '@/lib/session/server';


// O tipo vem de components/tasks/formState.ts: este arquivo é 'use server' e por isso
// não pode exportar nada além de funções assíncronas.
import type { TaskFormState } from '@/components/tasks/formState';

/**
 * Converte o erro da API em estado de formulário.
 *
 * É aqui que o `details[].field` do contrato vira "campo destacado": os campos do
 * formulário são nomeados com o mesmo caminho que a API usa (`recurrence.weekdays`),
 * então o mapa se monta sozinho e não há tradução para manter.
 */
function toFormState(causa: unknown): TaskFormState {
  if (isApiError(causa)) {
    const fieldErrors: Record<string, string> = {};

    for (const problema of causa.details) {
      fieldErrors[problema.field] = problema.issue;
    }

    return {
      status: 'error',
      message: messageFor(causa.code, causa.message),
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }

  return { status: 'error', message: 'Não conseguimos falar com o servidor.' };
}

function texto(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  if (typeof valor !== 'string') return undefined;

  const limpo = valor.trim();
  return limpo === '' ? undefined : limpo;
}

function numero(formData: FormData, campo: string): number | undefined {
  const valor = texto(formData, campo);
  if (valor === undefined) return undefined;

  const convertido = Number(valor);
  return Number.isNaN(convertido) ? undefined : convertido;
}

/** Monta a recorrência a partir dos campos — que têm o mesmo nome do contrato. */
function recorrenciaDe(formData: FormData) {
  const frequency = texto(formData, 'recurrence.frequency') ?? 'semanal';

  const recurrence: Record<string, unknown> = {
    frequency,
    startDate: texto(formData, 'recurrence.startDate'),
  };

  const interval = numero(formData, 'recurrence.interval');
  if (interval && interval > 1) recurrence.interval = interval;

  if (frequency === 'semanal') {
    recurrence.weekdays = formData
      .getAll('recurrence.weekdays')
      .map(Number)
      .filter((dia) => !Number.isNaN(dia));
  }

  if (frequency === 'mensal' || frequency === 'anual') {
    const dia = numero(formData, 'recurrence.dayOfMonth');
    if (dia) recurrence.dayOfMonth = dia;
  }

  const fim = texto(formData, 'recurrence.endDate');
  if (fim) recurrence.endDate = fim;

  return recurrence;
}

function corpoDaTarefa(formData: FormData) {
  const strategy = texto(formData, 'assignmentStrategy') ?? 'fixed';
  const assignedTo = texto(formData, 'assignedTo');

  return {
    name: texto(formData, 'name') ?? '',
    description: texto(formData, 'description'),
    recurrence: recorrenciaDe(formData),
    difficulty: texto(formData, 'difficulty') ?? 'medio',
    points: numero(formData, 'points'),
    // Em rodízio não existe responsável fixo — a API recusa os dois juntos.
    assignedTo: strategy === 'rotate' ? null : (assignedTo ?? null),
    assignmentStrategy: strategy,
  };
}

export async function createTask(
  householdId: string,
  _anterior: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  try {
    await (await serverApi()).tasks.create(householdId, corpoDaTarefa(formData) as CreateTaskRequest);
  } catch (causa) {
    return toFormState(causa);
  }

  revalidatePath('/tasks');
  redirect('/tasks');
}

export async function updateTask(
  taskId: string,
  _anterior: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const corpo = corpoDaTarefa(formData);

  try {
    // `status` não é enviado daqui: arquivar tem caminho próprio, e mandar os dois juntos
    // deixaria ambíguo o que o usuário quis.
    const { name, description, recurrence, difficulty, points, assignedTo, assignmentStrategy } =
      corpo;

    await (await serverApi()).tasks.update(taskId, {
      name,
      description,
      recurrence,
      difficulty,
      points,
      assignedTo,
      assignmentStrategy,
    } as UpdateTaskRequest);
  } catch (causa) {
    return toFormState(causa);
  }

  revalidatePath('/tasks');
  revalidatePath('/tasks/' + taskId);
  redirect('/tasks/' + taskId);
}

/** Arquivar é o padrão: o histórico e o placar sobrevivem. */
export async function archiveTask(taskId: string): Promise<void> {
  await (await serverApi()).tasks.archive(taskId);

  revalidatePath('/tasks');
  redirect('/tasks');
}

/** Excluir de vez apaga o histórico — por isso exige owner na API e confirmação aqui. */
export async function destroyTask(taskId: string): Promise<void> {
  await (await serverApi()).tasks.destroy(taskId);

  revalidatePath('/tasks');
  redirect('/tasks');
}

/** Desarquivar: volta a tarefa para a lista ativa. */
export async function unarchiveTask(taskId: string): Promise<void> {
  await (await serverApi()).tasks.update(taskId, { status: 'active' });

  revalidatePath('/tasks');
  redirect('/tasks');
}
