// app/(app)/reminders/actions.ts
// Criar, editar, adiar, marcar como feito e arquivar lembretes.
//
// Server Actions, como no resto do app: quem resolve a casa e a sessão é o servidor, e o
// cliente nunca monta um id de casa sozinho.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isApiError } from '@/lib/domain/api';
import type {
  CreateReminderRequest,
  ReminderChannel,
  ReminderSchedule,
  UpdateReminderRequest,
} from '@/lib/domain/api/types';
import { todayInZone } from '@/lib/domain/dates';
import { messageFor } from '@/lib/domain/labels';
import { requireContext, serverApi } from '@/lib/session/server';
import type {
  ReminderActionState,
  ReminderFormState,
} from '@/components/reminders/formState';

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

function parseSchedule(formData: FormData, timezone: string): ReminderSchedule {
  const frequency = (texto(formData, 'schedule.frequency') || 'diaria') as ReminderSchedule['frequency'];

  const intervalo = Number(texto(formData, 'schedule.interval'));

  const schedule: ReminderSchedule = {
    frequency,
    interval: Number.isInteger(intervalo) && intervalo >= 1 ? intervalo : 1,
    startDate: texto(formData, 'schedule.startDate') || todayInZone(timezone),
    time: texto(formData, 'schedule.time') || '08:00',
  };

  const fim = texto(formData, 'schedule.endDate');
  if (fim !== '') schedule.endDate = fim;

  if (frequency === 'semanal') {
    const dias = formData
      .getAll('schedule.weekdays')
      .map((dia) => Number(dia))
      .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6);

    if (dias.length > 0) schedule.weekdays = dias;
  }

  if (frequency === 'mensal') {
    const dia = texto(formData, 'schedule.dayOfMonth');
    if (dia !== '') schedule.dayOfMonth = Number(dia);
  }

  return schedule;
}

function parseReminder(formData: FormData, timezone: string, paraCriar: boolean) {
  const allMembers = formData.get('allMembers') === 'on';
  const recipients = formData.getAll('recipients').map((id) => String(id)).filter(Boolean);
  const channels = Array.from(
    new Set(formData.getAll('channels').map((canal) => String(canal)))
  ) as ReminderChannel[];

  const task = texto(formData, 'task');
  const notes = texto(formData, 'notes');

  const base = {
    title: texto(formData, 'title'),
    notes: notes === '' ? undefined : notes,
    schedule: parseSchedule(formData, timezone),
    allMembers,
    recipients: allMembers || recipients.length === 0 ? undefined : recipients,
    channels: channels.length > 0 ? channels : ['in_app'],
    task: task === '' ? null : task,
    skipIfTaskDone: formData.get('skipIfTaskDone') === 'on',
  };

  if (paraCriar) return base as CreateReminderRequest;

  // No PATCH, undefined significa "não mexe"; null é um valor (desvincular a tarefa).
  return base as UpdateReminderRequest;
}

function falha(causa: unknown): ReminderFormState {
  if (isApiError(causa)) {
    const fieldErrors: Record<string, string> = {};

    causa.details.forEach((detalhe) => {
      fieldErrors[detalhe.field] = detalhe.issue;
    });

    return {
      status: 'error',
      message: messageFor(causa.code, causa.message),
      fieldErrors,
    };
  }

  return { status: 'error', message: 'Não conseguimos falar com o servidor.' };
}

function falhaAcao(causa: unknown): ReminderActionState {
  if (isApiError(causa)) {
    return { status: 'error', message: messageFor(causa.code, causa.message) };
  }

  return { status: 'error', message: 'Não conseguimos falar com o servidor.' };
}

function revalidar() {
  revalidatePath('/reminders');
  revalidatePath('/panel');
}

export async function createReminder(
  _anterior: ReminderFormState,
  formData: FormData
): Promise<ReminderFormState> {
  const { householdId } = await requireContext();
  const api = await serverApi();
  const household = await api.households.get(householdId);
  const body = parseReminder(formData, household.timezone, true) as CreateReminderRequest;

  try {
    await api.reminders.create(householdId, body);
  } catch (causa) {
    return falha(causa);
  }

  revalidar();
  redirect('/reminders?criado=1');
}

export async function updateReminder(
  reminderId: string,
  _anterior: ReminderFormState,
  formData: FormData
): Promise<ReminderFormState> {
  const { householdId } = await requireContext();
  const api = await serverApi();
  const household = await api.households.get(householdId);
  const body = parseReminder(formData, household.timezone, false) as UpdateReminderRequest;

  try {
    await api.reminders.update(reminderId, body);
  } catch (causa) {
    return falha(causa);
  }

  revalidar();
  redirect('/reminders?salvo=1');
}

export async function acknowledgeReminder(
  reminderId: string,
  _anterior: ReminderActionState
): Promise<ReminderActionState> {
  try {
    await (await serverApi()).reminders.acknowledge(reminderId);
  } catch (causa) {
    return falhaAcao(causa);
  }

  revalidar();
  return { status: 'ok' };
}

export async function snoozeReminder(
  reminderId: string,
  _anterior: ReminderActionState,
  formData: FormData
): Promise<ReminderActionState> {
  const minutos = Number(formData.get('minutes'));
  const minutes = Number.isFinite(minutos) && minutos >= 1 && minutos <= 1440 ? minutos : 10;

  try {
    await (await serverApi()).reminders.snooze(reminderId, minutes);
  } catch (causa) {
    return falhaAcao(causa);
  }

  revalidar();
  return { status: 'ok' };
}

export async function archiveReminder(
  reminderId: string,
  _anterior: ReminderActionState
): Promise<ReminderActionState> {
  try {
    await (await serverApi()).reminders.archive(reminderId);
  } catch (causa) {
    return falhaAcao(causa);
  }

  revalidar();
  return { status: 'ok' };
}

export async function deleteReminderForever(
  reminderId: string,
  _anterior: ReminderActionState
): Promise<ReminderActionState> {
  try {
    await (await serverApi()).reminders.destroy(reminderId);
  } catch (causa) {
    return falhaAcao(causa);
  }

  revalidar();
  redirect('/reminders');
}
