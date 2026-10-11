// services/time.js
// Unico lugar que traduz instantes em DIAS do calendario da casa.
//
// Tudo no dominio usa datas 'YYYY-MM-DD' (dia local da casa). Comparar strings ISO
// funciona lexicograficamente e elimina a classe de bug mais comum deste projeto:
// o servidor rodando em UTC e a familia vivendo em America/Sao_Paulo.

const { DateTime } = require('luxon');

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function zoneOf(timezone) {
  return timezone || DEFAULT_TIMEZONE;
}

// Que dia e hoje NA CASA.
function todayInZone(timezone, now) {
  return DateTime.fromJSDate(now || new Date())
    .setZone(zoneOf(timezone))
    .toISODate();
}

// Ultima data (inclusive) cujo prazo JA passou, considerando a tolerancia da casa.
//
// Prazo de uma ocorrencia = fim do dia de vencimento + tolerancia em horas.
// Com tolerancia 0, a ocorrencia de hoje so vira "atrasada" quando o dia terminar.
function overdueCutoff(timezone, graceHours, now) {
  return DateTime.fromJSDate(now || new Date())
    .setZone(zoneOf(timezone))
    .minus({ hours: graceHours || 0 })
    .startOf('day')
    .minus({ days: 1 })
    .toISODate();
}

function addDays(dateString, days) {
  return DateTime.fromISO(dateString, { zone: 'utc' }).plus({ days }).toISODate();
}

// Soma dias a uma data do calendario (aritmetica pura, sem fuso).
function compare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

module.exports = {
  DEFAULT_TIMEZONE,
  zoneOf,
  todayInZone,
  overdueCutoff,
  addDays,
  compare,
  maxDate,
};
