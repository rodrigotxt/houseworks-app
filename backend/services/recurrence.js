// services/recurrence.js
// Expansao de uma recorrencia em datas de vencimento ('YYYY-MM-DD').
//
// Matematica de CALENDARIO PURA: nenhum fuso horario entra aqui. O fuso serve para
// decidir "que dia e hoje nesta casa" (services/time.js) — a expansao em si lida
// apenas com anos, meses e dias, o que a torna trivial de testar borda por borda.
//
// DECISAO: NAO usamos RRULE. O contrato exige que "dia 31" caia no ultimo dia dos
// meses que nao tem 31 (fevereiro inclusive); o BYMONTHDAY do iCalendar simplesmente
// PULA esses meses. A expansao propria mantem o comportamento igual ao documentado.
// (ver docs/ROADMAP.md, decisao D2)

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Trava de seguranca: nenhuma expansao devolve mais que isto.
const EXPANSION_LIMIT = 500;

function toUTC(dateString) {
  const parts = String(dateString).split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function toISODate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(ms, days) {
  return ms + days * MS_PER_DAY;
}

function weekdayOf(ms) {
  return new Date(ms).getUTCDay(); // 0 = domingo
}

function startOfWeek(ms) {
  return addDays(ms, -weekdayOf(ms));
}

function daysInMonth(year, month) {
  // month em base 1: Date.UTC(ano, mes, 0) cai no ultimo dia do mes anterior.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function* dailyDates(recurrence, horizon) {
  const start = toUTC(recurrence.startDate);
  const interval = recurrence.interval || 1;

  for (let ms = start; ms <= horizon; ms = addDays(ms, interval)) {
    yield ms;
  }
}

function* weeklyDates(recurrence, horizon) {
  const start = toUTC(recurrence.startDate);
  const interval = recurrence.interval || 1;
  const weekdays = (recurrence.weekdays || []).slice().sort((a, b) => a - b);

  let weekStart = startOfWeek(start);

  while (weekStart <= horizon) {
    for (const weekday of weekdays) {
      const ms = addDays(weekStart, weekday);

      if (ms < start) continue; // antes do inicio da regra
      if (ms > horizon) return; // passou do horizonte
      yield ms;
    }

    weekStart = addDays(weekStart, 7 * interval);
  }
}

function* monthlyDates(recurrence, horizon) {
  const start = toUTC(recurrence.startDate);
  const startDate = new Date(start);
  const interval = recurrence.interval || 1;
  const preferredDay = recurrence.dayOfMonth || startDate.getUTCDate();

  // Indice absoluto de mes, para a virada de ano sair de graca.
  let monthIndex = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();

  while (true) {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;

    // Aqui esta o ajuste que o RRULE nao faz: dia 31 em fevereiro vira 28 (ou 29).
    const day = Math.min(preferredDay, daysInMonth(year, month));
    const ms = Date.UTC(year, month - 1, day);

    if (ms > horizon) return;
    if (ms >= start) yield ms;

    monthIndex += interval;
  }
}

function* yearlyDates(recurrence, horizon) {
  const start = toUTC(recurrence.startDate);
  const startDate = new Date(start);
  const interval = recurrence.interval || 1;
  const month = startDate.getUTCMonth() + 1;
  const preferredDay = recurrence.dayOfMonth || startDate.getUTCDate();

  let year = startDate.getUTCFullYear();

  while (true) {
    // 29 de fevereiro em ano nao bissexto cai em 28.
    const day = Math.min(preferredDay, daysInMonth(year, month));
    const ms = Date.UTC(year, month - 1, day);

    if (ms > horizon) return;
    if (ms >= start) yield ms;

    year += interval;
  }
}

function* occasionalDates(recurrence) {
  yield toUTC(recurrence.startDate);
}

const EXPANDERS = {
  diaria: dailyDates,
  semanal: weeklyDates,
  mensal: monthlyDates,
  anual: yearlyDates,
  ocasional: occasionalDates,
};

// Datas devidas dentro de [from, to], em ordem crescente e sem repeticao.
// from/to sao 'YYYY-MM-DD' inclusivos. to e OBRIGATORIO: a expansao nunca e infinita.
function expandDueDates(recurrence, range) {
  const from = range.from ? toUTC(range.from) : null;
  const to = toUTC(range.to);
  const end = recurrence.endDate ? toUTC(recurrence.endDate) : null;
  const limit = range.limit || EXPANSION_LIMIT;

  const expander = EXPANDERS[recurrence.frequency];
  if (!expander) {
    return [];
  }

  // A regra nunca passa do fim declarado nem do horizonte pedido.
  const horizon = end !== null && end < to ? end : to;

  const dates = [];
  const seen = new Set();

  for (const ms of expander(recurrence, horizon)) {
    if (from !== null && ms < from) continue;
    if (end !== null && ms > end) break;

    const iso = toISODate(ms);

    // "semanal" com varios dias pode, em teoria, repetir; a defesa e barata.
    if (seen.has(iso)) continue;
    seen.add(iso);

    dates.push(iso);

    if (dates.length >= limit) break;
  }

  return dates;
}

// Validacoes cruzadas da regra. Usadas pelo schema de entrada e pelo modelo.
function validateRecurrence(recurrence) {
  const problems = [];

  if (!recurrence || !recurrence.frequency) {
    return ['A recorrencia e obrigatoria.'];
  }

  if (recurrence.frequency === 'semanal' && (!recurrence.weekdays || recurrence.weekdays.length === 0)) {
    problems.push('Informe ao menos um dia da semana para frequencia semanal.');
  }

  if (recurrence.startDate && recurrence.endDate && recurrence.endDate < recurrence.startDate) {
    problems.push('A data final da recorrencia nao pode ser anterior a inicial.');
  }

  return problems;
}

module.exports = {
  EXPANSION_LIMIT,
  expandDueDates,
  validateRecurrence,
  toISODate,
  addDays,
  toUTC,
};
