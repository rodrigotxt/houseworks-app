// lib/domain/format.ts
// Como os números do desempenho viram texto.
//
// Fica no domínio, e não dentro de um componente, porque a TV, o celular e qualquer
// cliente futuro precisam escrever a mesma coisa — e porque um teste de formatação não
// deveria precisar de React.

/** Fração (0..1) como porcentagem inteira. 0.3333 -> '33%'. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Math.round(value * 100) + '%';
}

/**
 * Atraso em horas, em linguagem de gente.
 *
 * A referência é o FIM do dia de vencimento, então um valor negativo significa que a
 * tarefa foi feita antes do prazo — e é isso que o texto precisa dizer, não "atraso
 * negativo".
 */
export function formatDelay(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';

  const absoluto = Math.abs(hours);
  if (absoluto < 1) return 'no prazo';

  const medida =
    absoluto < 24
      ? Math.round(absoluto) + 'h'
      : (() => {
          const dias = Math.round(absoluto / 24);
          return dias + (dias === 1 ? ' dia' : ' dias');
        })();

  return hours < 0 ? medida + ' antes do prazo' : medida + ' depois do prazo';
}

/** Nota média: uma casa decimal, e '—' quando ninguém avaliou. */
export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(1);
}

/**
 * Estimativa de tempo em linguagem curta: 45 -> '45 min', 60 -> '1h', 90 -> '1h30'.
 *
 * Passar de 60 minutos para horas evita o absurdo de ler '90 min' numa tela em que o
 * resto do texto já está em unidades maiores.
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return minutes + ' min';

  const horas = Math.floor(minutes / 60);
  const resto = minutes % 60;

  return resto === 0 ? horas + 'h' : horas + 'h' + String(resto).padStart(2, '0');
}

export interface TempoComparado {
  /** O tempo real medio, em minutos. `null` quando ninguem mediu. */
  real: number | null;
  /** Quantas execucoes tiveram tempo medido. */
  medidas: number;
  /** Quantas usaram a estimativa por falta de informacao. */
  presumidas: number;
}

/**
 * Tempo real medio de uma lista de execucoes.
 *
 * A regra do produto: quando ninguem informou quanto levou, vale a estimativa que a
 * execucao guardou. Mas a media devolve TAMBEM quantas foram medidas e quantas foram
 * presumidas — uma media feita so de presuncoes e igual a estimativa por construcao,
 * e apresenta-la como "tempo real" seria mentira.
 */
export function tempoRealMedio(
  execucoes: { actualMinutes?: number | null; estimatedMinutes?: number | null }[]
): TempoComparado {
  let soma = 0;
  let medidas = 0;
  let presumidas = 0;

  for (const execucao of execucoes) {
    const considerados = execucao.actualMinutes ?? execucao.estimatedMinutes ?? null;
    if (considerados === null) continue;

    soma += considerados;
    if (execucao.actualMinutes == null) presumidas += 1;
    else medidas += 1;
  }

  const total = medidas + presumidas;

  return { real: total === 0 ? null : Math.round(soma / total), medidas, presumidas };
}

/** Concorda o verbo com a quantidade: '1 tarefa' / '3 tarefas'. */
export function plural(quantidade: number, singular: string, plural: string): string {
  return quantidade + ' ' + (quantidade === 1 ? singular : plural);
}
