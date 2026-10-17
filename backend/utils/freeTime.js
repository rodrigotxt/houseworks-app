// utils/freeTime.js
// Quanto tempo livre uma pessoa tem num dia da semana.
//
// O tempo livre e uma configuracao SEMANAL que se repete: nao muda por data. Um dia
// sem valor e zero -- marcar e o que da tempo livre.
//
// A distincao que importa aqui e entre NULL e ZERO:
//   null = nunca configurado -> a pessoa fica FORA do aviso de carga;
//   zero = configurado, sem tempo naquele dia -> aviso legitimo.
// Sem essa distincao, toda a casa nasceria "estourando" o tempo livre no primeiro dia.

const DIAS_NA_SEMANA = 7;
const MINUTOS_POR_DIA_MAX = 1440;

/** Domingo = 0, igual a Date.getDay() e ao `weekdays` da recorrencia. */
const SEMANA_VAZIA = Object.freeze([0, 0, 0, 0, 0, 0, 0]);

/**
 * Minutos livres no dia pedido.
 *
 * @returns {number|null} null quando a pessoa nunca configurou o tempo livre.
 */
function freeMinutesOn(freeTime, weekday) {
  if (!freeTime) return null;
  if (freeTime.mode === 'fixo') return freeTime.fixedMinutes ?? 0;

  return freeTime.byWeekday?.[weekday] ?? 0;
}

/** Grava sempre a semana completa, para a leitura nunca precisar de tratamento especial. */
function normalizeFreeTime(freeTime) {
  return {
    mode: freeTime.mode,
    fixedMinutes: freeTime.fixedMinutes ?? null,
    byWeekday: SEMANA_VAZIA.map((_, indice) => freeTime.byWeekday?.[indice] ?? 0),
  };
}

module.exports = {
  DIAS_NA_SEMANA,
  MINUTOS_POR_DIA_MAX,
  SEMANA_VAZIA,
  freeMinutesOn,
  normalizeFreeTime,
};