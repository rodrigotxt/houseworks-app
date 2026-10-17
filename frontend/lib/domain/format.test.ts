// lib/domain/format.test.ts
//
//   npm run test:domain
//
// Mesmo runner do spatial.test.ts: o do proprio Node, sem Jest nem jsdom. Cabe aqui
// porque format.ts e TypeScript puro — nao toca no DOM.
//
// O caso que mais importa e a fronteira dos 60 minutos: e onde um texto mal escolhido
// faz a tela dizer '90 min' onde todo o resto ja esta em horas.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDuration, tempoRealMedio } from './format.ts';

test('abaixo de uma hora, escreve em minutos', () => {
  assert.equal(formatDuration(1), '1 min');
  assert.equal(formatDuration(5), '5 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(59), '59 min');
});

test('a partir de 60 minutos, vira hora cheia', () => {
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(1440), '24h');
});

test('hora quebrada sai com dois digitos nos minutos', () => {
  // 1h5 daria a impressao de '15'. O zero a esquerda evita a leitura errada.
  assert.equal(formatDuration(61), '1h01');
  assert.equal(formatDuration(65), '1h05');
  assert.equal(formatDuration(90), '1h30');
  assert.equal(formatDuration(605), '10h05');
});

test('sem estimativa, escreve o travessao', () => {
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(undefined), '—');
});

// --- tempo real x estimado ---

test('a media usa o tempo informado', () => {
  const tempo = tempoRealMedio([
    { actualMinutes: 40, estimatedMinutes: 30 },
    { actualMinutes: 50, estimatedMinutes: 30 },
  ]);

  assert.equal(tempo.real, 45);
  assert.equal(tempo.medidas, 2);
  assert.equal(tempo.presumidas, 0);
});

test('sem tempo informado, vale a estimativa da execucao', () => {
  const tempo = tempoRealMedio([
    { actualMinutes: null, estimatedMinutes: 30 },
    { actualMinutes: 50, estimatedMinutes: 30 },
  ]);

  // (30 + 50) / 2 = 40. E conta 1 presumida, para a tela poder ser honesta.
  assert.equal(tempo.real, 40);
  assert.equal(tempo.medidas, 1);
  assert.equal(tempo.presumidas, 1);
});

test('sem tempo e sem estimativa, a execucao nao entra na conta', () => {
  const tempo = tempoRealMedio([
    { actualMinutes: null, estimatedMinutes: null },
    { actualMinutes: 20, estimatedMinutes: null },
  ]);

  assert.equal(tempo.real, 20);
  assert.equal(tempo.medidas, 1);
});

test('lista vazia ou sem dados devolve real null, nao zero', () => {
  assert.equal(tempoRealMedio([]).real, null);
  assert.equal(tempoRealMedio([{ actualMinutes: null, estimatedMinutes: null }]).real, null);
});

test('media feita so de presuncoes e igual a estimativa', () => {
  // E por isso que presumidas existe: sem esse numero, isto se apresentaria como
  // "tempo real" sendo apenas a estimativa de volta.
  const tempo = tempoRealMedio([
    { actualMinutes: null, estimatedMinutes: 30 },
    { actualMinutes: null, estimatedMinutes: 30 },
  ]);

  assert.equal(tempo.real, 30);
  assert.equal(tempo.medidas, 0);
  assert.equal(tempo.presumidas, 2);
});