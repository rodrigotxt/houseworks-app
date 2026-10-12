// lib/device/spatial.ts
// Navegacao espacial: para onde o foco vai quando uma seta e apertada.
//
// POR QUE NAO BASTA A ORDEM DO DOM. `tabindex` e ordem de leitura funcionam numa lista,
// mas quebram num painel: com duas colunas, "o proximo" faz a seta para baixo pular para
// a coluna ao lado. O que o controle remoto promete e ESPACO — a seta vai para o que esta
// naquela direcao, independente da ordem em que o HTML foi escrito.
//
// TypeScript puro: sem DOM e sem React. Quem mede os elementos e o hook, que entrega
// retangulos; aqui so mora a decisao, e por isso ela da para ser conferida sozinha.

export type Direction = 'up' | 'down' | 'left' | 'right';

/** O que basta saber de um elemento para decidir: onde ele esta na tela. */
export interface Box {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

const centroX = (caixa: Box) => (caixa.left + caixa.right) / 2;
const centroY = (caixa: Box) => (caixa.top + caixa.bottom) / 2;

/**
 * Quanto o desalinhamento pesa na escolha.
 *
 * 2 significa: andar 100px "de lado" custa o mesmo que andar 200px na direcao pedida.
 * Sem esse peso, um elemento distante mas alinhado perderia para um vizinho torto — e a
 * seta para baixo trocaria de coluna sozinha.
 */
const PESO_DESALINHO = 2;

/**
 * Folga minima para considerar que o candidato esta NA direcao.
 *
 * Sem ela, dois elementos lado a lado (mesmo centro vertical) se enxergariam como "abaixo"
 * um do outro, e a seta para baixo iria para o lado.
 */
const FOLGA = 2;

/**
 * Distancia perpendicular entre dois elementos, ZERADA quando eles se sobrepoem.
 *
 * E o que faz "esta logo abaixo" ganhar de "esta abaixo e longe": a sobreposicao e o
 * sinal de que os dois estao na mesma faixa, que e como uma pessoa enxerga a tela.
 */
function desalinhamento(atual: Box, candidato: Box, vertical: boolean): number {
  if (vertical) {
    if (candidato.left < atual.right && candidato.right > atual.left) return 0;
    return Math.max(atual.left - candidato.right, candidato.left - atual.right);
  }

  if (candidato.top < atual.bottom && candidato.bottom > atual.top) return 0;
  return Math.max(atual.top - candidato.bottom, candidato.top - atual.bottom);
}

/**
 * Indice do proximo alvo, ou -1 quando nao ha nada naquela direcao.
 *
 * Devolver -1 e proposital: o hook usa isso para NAO consumir a tecla, deixando o
 * navegador rolar a pagina. No fim da lista, a seta para baixo deve rolar, nao travar.
 */
export function pickNext(atual: Box, candidatos: Box[], direcao: Direction): number {
  const vertical = direcao === 'up' || direcao === 'down';
  const cx = centroX(atual);
  const cy = centroY(atual);

  let melhor = -1;
  let melhorNota = Infinity;

  for (let indice = 0; indice < candidatos.length; indice += 1) {
    const candidato = candidatos[indice];

    const ddx = centroX(candidato) - cx;
    const ddy = centroY(candidato) - cy;

    // Quanto se anda NA direcao pedida (negativo = esta atras).
    const principal =
      direcao === 'down' ? ddy : direcao === 'up' ? -ddy : direcao === 'right' ? ddx : -ddx;

    if (principal <= FOLGA) continue;

    const nota = principal + desalinhamento(atual, candidato, vertical) * PESO_DESALINHO;

    if (nota < melhorNota) {
      melhorNota = nota;
      melhor = indice;
    }
  }

  return melhor;
}
