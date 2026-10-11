// lib/domain/dates.ts
// Datas do calendario da casa, sem deslocamento de fuso.
//
// A API trabalha com "dia" no formato YYYY-MM-DD (o dia local DA CASA) e com instantes
// em ISO 8601 UTC. Sao coisas diferentes e nao podem ser misturadas:
//
//   ERRADO: new Date(dueDate).toLocaleDateString()   -> o dia muda conforme o fuso do browser
//   CERTO:  calendarToLocalDate(dueDate)             -> meia-noite local, sem deslocar
//
// Nada aqui importa React: e TypeScript puro e testavel com node.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

export function parseCalendarDate(value: string): CalendarParts {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** Converte 'YYYY-MM-DD' em Date na meia-noite LOCAL — sem passar por UTC. */
export function calendarToLocalDate(value: string): Date {
  const { year, month, day } = parseCalendarDate(value);
  return new Date(year, month - 1, day);
}

/** Que dia e hoje NA CASA (o fuso vem de household.timezone). */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Aritmetica de calendario pura, em UTC, para nao esbarrar em horario de verao. */
export function addDays(value: string, days: number): string {
  const { year, month, day } = parseCalendarDate(value);
  const ms = Date.UTC(year, month - 1, day) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = domingo. Mesma convencao dos weekdays da recorrencia na API. */
export function weekdayOf(value: string): number {
  const { year, month, day } = parseCalendarDate(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  const a = parseCalendarDate(from);
  const b = parseCalendarDate(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / MS_PER_DAY
  );
}

/** '10/07' — curto, para cabecalhos de lista. */
export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
    calendarToLocalDate(value)
  );
}

/** '10 de julho' — sem ano, para a agenda da semana. */
export function formatDayAndMonth(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(
    calendarToLocalDate(value)
  );
}

export function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(calendarToLocalDate(value));
}

/** Instante ISO convertido para o fuso da casa: '10/07 às 15:30'. */
export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** 'Hoje', 'Amanhã', '3 dias atrasada' — o rotulo que a agenda usa. */
export function relativeDueLabel(dueDate: string, today: string): string {
  const diferenca = daysBetween(today, dueDate);

  if (diferenca === 0) return 'Hoje';
  if (diferenca === 1) return 'Amanhã';
  if (diferenca === -1) return 'Ontem';
  if (diferenca > 1 && diferenca <= 7) return 'Em ' + diferenca + ' dias';
  if (diferenca < -1) return Math.abs(diferenca) + ' dias atrás';

  return formatShortDate(dueDate);
}

/** A janela padrao da agenda, igual a que a API usa quando nao se manda from/to. */
export function defaultWindow(household: { timezone: string; horizonDays: number }, now?: Date) {
  const today = todayInZone(household.timezone, now);
  return { from: today, to: addDays(today, household.horizonDays) };
}
