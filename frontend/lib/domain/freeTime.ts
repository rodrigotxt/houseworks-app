// lib/domain/freeTime.ts
// Tempo livre para executar as tarefas.
//
// Mesma regra do backend (backend/utils/freeTime.js), aqui para o frontend poder comparar
// a carga do dia com o tempo disponivel sem uma ida a API por dia da semana.
//
// A distincao que importa: NULL nao e ZERO.
//   null = nunca configurado -> a pessoa fica fora do aviso;
//   zero = configurado, sem tempo naquele dia -> aviso legitimo.

export type FreeTimeMode = 'fixo' | 'por_dia';

export const DIAS_NA_SEMANA = 7;
export const MINUTOS_POR_DIA_MAX = 1440;

export const SEMANA_VAZIA: readonly number[] = [0, 0, 0, 0, 0, 0, 0];

export interface FreeTime {
  mode: FreeTimeMode;
  fixedMinutes?: number | null;
  byWeekday?: number[] | null;
}

/**
 * Minutos livres no dia pedido. Domingo = 0, como em `Date.getDay()`.
 *
 * @returns null quando a pessoa nunca configurou o tempo livre.
 */
export function freeMinutesOn(freeTime: FreeTime | null | undefined, weekday: number): number | null {
  if (!freeTime) return null;
  if (freeTime.mode === 'fixo') return freeTime.fixedMinutes ?? 0;

  return freeTime.byWeekday?.[weekday] ?? 0;
}

export interface MembroComTempoLivre {
  id: string;
  name: string;
  freeTime: FreeTime | null;
}

export interface OcorrenciaParaCarga {
  status: string;
  assignedTo?: { id: string; name: string } | null;
  task?: { estimatedMinutes?: number | null } | null;
}

export interface CargaDoDia {
  memberId: string;
  memberName: string;
  /** Soma das estimativas conhecidas, em minutos. */
  minutes: number;
  freeMinutes: number;
  /** Quantas tarefas do dia nao tem estimativa — a soma nao as enxerga. */
  semEstimativa: number;
  excede: boolean;
}

/**
 * Quanto cada pessoa tem para fazer num dia, comparado com o tempo livre dela.
 *
 * Regras:
 *   - ocorrencia pulada nao conta: nao vai consumir tempo de ninguem;
 *   - ocorrencia sem responsavel nao entra: nao ha de quem cobrar;
 *   - pessoa sem tempo livre configurado (null) fica FORA: nunca disseram quanto tem;
 *   - tarefa sem estimativa nao soma, mas e contada em `semEstimativa`, para a tela poder
 *     ser honesta sobre o que a conta nao enxerga.
 */
export function cargasDoDia(
  ocorrencias: OcorrenciaParaCarga[],
  membros: MembroComTempoLivre[],
  weekday: number
): CargaDoDia[] {
  const porMembro = new Map<string, { minutos: number; semEstimativa: number }>();

  for (const ocorrencia of ocorrencias) {
    if (ocorrencia.status === 'skipped') continue;
    if (!ocorrencia.assignedTo) continue;

    const atual = porMembro.get(ocorrencia.assignedTo.id) ?? { minutos: 0, semEstimativa: 0 };
    const estimativa = ocorrencia.task?.estimatedMinutes ?? null;

    if (estimativa === null) atual.semEstimativa += 1;
    else atual.minutos += estimativa;

    porMembro.set(ocorrencia.assignedTo.id, atual);
  }

  const cargas: CargaDoDia[] = [];

  for (const membro of membros) {
    const livre = freeMinutesOn(membro.freeTime, weekday);
    if (livre === null) continue;

    const atual = porMembro.get(membro.id);
    if (!atual) continue;

    cargas.push({
      memberId: membro.id,
      memberName: membro.name,
      minutes: atual.minutos,
      freeMinutes: livre,
      semEstimativa: atual.semEstimativa,
      excede: atual.minutos > livre,
    });
  }

  return cargas;
}

/**
 * Minutos -> texto do campo, em horas: 120 -> '2', 90 -> '1.5', 0 -> '0'.
 *
 * A virgula fica de fora de proposito: o campo e `type="number"`, que so aceita ponto.
 */
export function minutesToHoursText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';

  const horas = minutes / 60;
  return Number.isInteger(horas) ? String(horas) : horas.toFixed(1);
}

/** Texto do campo, em horas -> minutos. Vazio ou invalido vira 0. */
export function hoursTextToMinutes(texto: string): number {
  const numero = Number(String(texto).replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return 0;

  return Math.min(Math.round(numero * 60), MINUTOS_POR_DIA_MAX);
}