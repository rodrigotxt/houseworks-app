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

/** Concorda o verbo com a quantidade: '1 tarefa' / '3 tarefas'. */
export function plural(quantidade: number, singular: string, plural: string): string {
  return quantidade + ' ' + (quantidade === 1 ? singular : plural);
}
