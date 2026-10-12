// lib/device/spatial.test.ts
//
//   npm run test:spatial
//
// Roda com o runner embutido do Node — sem Jest, sem jsdom, sem dependencia nova. Isso so
// e possivel porque spatial.ts e TypeScript puro: nao toca no DOM, recebe retangulos e
// devolve um indice. Separar a decisao da medicao foi o que tornou esta regra testavel, e
// a navegacao por controle remoto e exatamente o tipo de coisa que ninguem percebe quebrada
// ate estar sentado no sofa.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickNext, type Box } from './spatial.ts';

const caixa = (top: number, left: number, largura = 400, altura = 100): Box => ({
  top,
  left,
  right: left + largura,
  bottom: top + altura,
});

// Uma coluna de quatro cartoes, como a lista do painel.
const lista: Box[] = [caixa(0, 0), caixa(120, 0), caixa(240, 0), caixa(360, 0)];

// Duas colunas. E aqui que a ordem do DOM erraria: o item 1 fica AO LADO do 0, nao abaixo.
const grade: Box[] = [
  caixa(0, 0),
  caixa(0, 440),
  caixa(140, 0),
  caixa(140, 440),
  caixa(280, 0),
  caixa(280, 440),
];

test('desce e sobe a lista, um item por vez', () => {
  assert.equal(pickNext(lista[0], lista, 'down'), 1);
  assert.equal(pickNext(lista[1], lista, 'down'), 2);
  assert.equal(pickNext(lista[2], lista, 'up'), 1);
});

test('nas pontas devolve -1, para o navegador rolar a pagina', () => {
  assert.equal(pickNext(lista[0], lista, 'up'), -1);
  assert.equal(pickNext(lista[3], lista, 'down'), -1);
});

test('numa lista de uma coluna, a seta lateral nao tem destino', () => {
  assert.equal(pickNext(lista[1], lista, 'right'), -1);
  assert.equal(pickNext(lista[1], lista, 'left'), -1);
});

test('com duas colunas, descer continua NA MESMA coluna', () => {
  assert.equal(pickNext(grade[0], grade, 'down'), 2, 'esquerda desce para a esquerda');
  assert.equal(pickNext(grade[1], grade, 'down'), 3, 'direita desce para a direita');
  assert.equal(pickNext(grade[3], grade, 'up'), 1, 'direita sobe pela direita');
});

test('com duas colunas, a seta lateral troca de coluna', () => {
  assert.equal(pickNext(grade[0], grade, 'right'), 1);
  assert.equal(pickNext(grade[1], grade, 'left'), 0);
});

test('elementos lado a lado nao se enxergam como acima/abaixo', () => {
  const ladoALado: Box[] = [caixa(0, 0), caixa(0, 440)];
  assert.equal(pickNext(ladoALado[0], ladoALado, 'down'), -1);
  assert.equal(pickNext(ladoALado[1], ladoALado, 'up'), -1);
});

test('o alinhado vence o mais proximo, quando o mais proximo esta torto', () => {
  // O item 1 esta mais perto em distancia vertical, mas deslocado 430px para o lado;
  // o item 2 esta mais longe e alinhado. Quem usa o controle espera o 2.
  const misto: Box[] = [caixa(0, 0), caixa(150, 430), caixa(180, 5)];
  assert.equal(pickNext(misto[0], misto, 'down'), 2);
});

test('um cartao largo desce para o que esta sob ele', () => {
  const largo: Box[] = [
    { top: 0, left: 0, right: 800, bottom: 200 },
    { top: 240, left: 40, right: 300, bottom: 320 },
    { top: 240, left: 500, right: 760, bottom: 320 },
  ];
  assert.equal(pickNext(largo[0], largo, 'down'), 1);
});

test('sem candidatos, devolve -1 em vez de estourar', () => {
  assert.equal(pickNext(caixa(0, 0), [], 'down'), -1);
});
