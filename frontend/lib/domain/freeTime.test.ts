// lib/domain/freeTime.test.ts
//
//   npm run test:domain
//
// O que mais importa aqui e a fronteira entre NULL e ZERO: e ela que decide se uma pessoa
// entra ou nao no aviso de carga. Trocar as duas faria a casa inteira nascer "estourando"
// o tempo livre no primeiro dia.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cargasDoDia,
  freeMinutesOn,
  hoursTextToMinutes,
  minutesToHoursText,
  type MembroComTempoLivre,
  type OcorrenciaParaCarga,
} from './freeTime.ts';

// Seg a sex 1h, sabado 4h, domingo nada -- o exemplo do pedido.
const SEMANA = [0, 60, 60, 60, 60, 60, 240];

const membro = (over: Partial<MembroComTempoLivre> = {}): MembroComTempoLivre => ({
  id: 'm1',
  name: 'Isabella',
  freeTime: { mode: 'por_dia', byWeekday: SEMANA },
  ...over,
});

const ocorrencia = (over: Partial<OcorrenciaParaCarga> = {}): OcorrenciaParaCarga => ({
  status: 'pending',
  assignedTo: { id: 'm1', name: 'Isabella' },
  task: { estimatedMinutes: 30 },
  ...over,
});

test('modo fixo vale para qualquer dia', () => {
  const freeTime = { mode: 'fixo' as const, fixedMinutes: 120 };

  assert.equal(freeMinutesOn(freeTime, 0), 120);
  assert.equal(freeMinutesOn(freeTime, 6), 120);
});

test('modo por dia le a posicao do dia, domingo primeiro', () => {
  const freeTime = { mode: 'por_dia' as const, byWeekday: SEMANA };

  assert.equal(freeMinutesOn(freeTime, 0), 0);
  assert.equal(freeMinutesOn(freeTime, 1), 60);
  assert.equal(freeMinutesOn(freeTime, 6), 240);
});

test('nunca configurado devolve null, e nao zero', () => {
  assert.equal(freeMinutesOn(null, 1), null);
  assert.equal(freeMinutesOn(undefined, 1), null);
});

test('dia ausente no modo por dia vale zero', () => {
  assert.equal(freeMinutesOn({ mode: 'por_dia', byWeekday: [60] }, 3), 0);
});

test('horas viram minutos e voltam', () => {
  assert.equal(hoursTextToMinutes('2'), 120);
  assert.equal(hoursTextToMinutes('1.5'), 90);
  assert.equal(hoursTextToMinutes('0,5'), 30);
  assert.equal(hoursTextToMinutes(''), 0);
  assert.equal(hoursTextToMinutes('abc'), 0);

  assert.equal(minutesToHoursText(120), '2');
  assert.equal(minutesToHoursText(90), '1.5');
  assert.equal(minutesToHoursText(0), '0');
});

test('acima do tempo livre, avisa', () => {
  // 3 tarefas de 30 min contra 1h livre: 90 > 60.
  const cargas = cargasDoDia([ocorrencia(), ocorrencia(), ocorrencia()], [membro()], 1);

  assert.equal(cargas.length, 1);
  assert.equal(cargas[0].minutes, 90);
  assert.equal(cargas[0].freeMinutes, 60);
  assert.equal(cargas[0].excede, true);
});

test('dentro do tempo livre, nao avisa', () => {
  const cargas = cargasDoDia([ocorrencia()], [membro()], 1);

  assert.equal(cargas[0].excede, false);
});

test('no sabado cabe o que nao cabia no meio da semana', () => {
  const tres = [ocorrencia(), ocorrencia(), ocorrencia()];

  assert.equal(cargasDoDia(tres, [membro()], 1)[0].excede, true);
  assert.equal(cargasDoDia(tres, [membro()], 6)[0].excede, false);
});

test('sem tempo livre configurado, a pessoa fica fora do aviso', () => {
  const cargas = cargasDoDia([ocorrencia(), ocorrencia(), ocorrencia()], [membro({ freeTime: null })], 1);

  assert.deepEqual(cargas, []);
});

test('pulada nao consome tempo', () => {
  const cargas = cargasDoDia([ocorrencia(), ocorrencia({ status: 'skipped' })], [membro()], 1);

  assert.equal(cargas[0].minutes, 30);
});

test('tarefa sem estimativa nao soma, mas e contada', () => {
  const cargas = cargasDoDia([ocorrencia({ task: { estimatedMinutes: null } })], [membro()], 1);

  assert.equal(cargas[0].minutes, 0);
  assert.equal(cargas[0].semEstimativa, 1);
});

test('tarefa sem responsavel nao entra na conta de ninguem', () => {
  const cargas = cargasDoDia([ocorrencia({ assignedTo: null })], [membro()], 1);

  assert.deepEqual(cargas, []);
});