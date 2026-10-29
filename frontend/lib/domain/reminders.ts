// lib/domain/reminders.ts
// Texto e regras de exibição dos lembretes. TypeScript puro, como o resto do domínio.
//
// O lembrete tem DUAS coordenadas de tempo e elas não podem ser confundidas:
//
//   - schedule (recorrência + hora local da casa): "toda dia às 21:00";
//   - nextFireAt (instante UTC): o próximo toque concreto.
//
// Quem formata precisa do fuso da casa para transformar um no outro — e é por isso que
// a casa viaja junto com o lembrete nas telas.

import type { Reminder, ReminderChannel, ReminderSchedule } from './api/types';
import { describeRecurrence, WEEKDAY_SHORT } from './labels';
import { todayInZone, relativeDueLabel } from './dates';

export const REMINDER_STATUS_LABELS: Record<Reminder['status'], string> = {
  active: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
};

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  in_app: 'No app',
  push: 'Notificação push',
  email: 'E-mail',
  sms: 'SMS',
};

/** "Todos os dias às 21:00", "Toda segunda às 08:00", "Uma vez só em 10/07 às 14:00". */
export function describeSchedule(schedule: ReminderSchedule): string {
  const recorrencia = describeRecurrence(schedule);

  if (schedule.frequency === 'ocasional') {
    const [ano, mes, dia] = schedule.startDate.split('-');
    void ano;
    return 'Uma vez só, em ' + dia + '/' + mes + ' às ' + schedule.time;
  }

  return recorrencia + ' às ' + schedule.time;
}

/** "Hoje às 21:00", "Amanhã às 08:00", "Em 3 dias às 18:00". */
export function describeNextFire(
  nextFireAt: string | null | undefined,
  timezone: string,
  now: Date = new Date()
): string | null {
  if (!nextFireAt) return null;

  const instante = new Date(nextFireAt);
  const diaLocal = todayInZone(timezone, instante);
  const hoje = todayInZone(timezone, now);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instante);

  return relativeDueLabel(diaLocal, hoje) + ' às ' + hora;
}

/** Quem recebe, em uma linha: "Todos", "Ana", "Ana e João", "Ana, João e +2". */
export function describeRecipients(reminder: Pick<Reminder, 'allMembers' | 'recipients'>): string {
  if (reminder.allMembers) return 'Todos da casa';

  const nomes = (reminder.recipients ?? []).map((pessoa) => pessoa.name);

  if (nomes.length === 0) return 'Ninguém';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return nomes[0] + ' e ' + nomes[1];

  return nomes[0] + ', ' + nomes[1] + ' e +' + (nomes.length - 2);
}

/** Dias da semana em texto curto: "seg, qua, sex". */
export function describeWeekdays(weekdays: number[] | null | undefined): string {
  if (!weekdays || weekdays.length === 0) return '';

  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((dia) => WEEKDAY_SHORT[dia])
    .join(', ');
}
