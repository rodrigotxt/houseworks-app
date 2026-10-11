// tests/stats.test.js
// Fase 4 — desempenho.
//
// A fixture e deliberadamente pequena e de numeros redondos: o aceite do roadmap pede
// asserção EXATA, nao aproximada. Todas as ocorrencias vencem em 2025-07-10, e as
// conclusoes foram escolhidas para produzir atrasos que dao conta exata.

const mongoose = require('mongoose');

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const TaskOccurrence = require('../models/TaskOccurrence');
const TaskExecution = require('../models/TaskExecution');
const Task = require('../models/Task');
const { periodWindow } = require('../services/stats');
const { createTask } = require('./helpers/fixtures');

const TZ = 'America/Sao_Paulo';
const JANELA = { from: '2025-07-01', to: '2025-07-31' };
const VENCIMENTO = '2025-07-10';

// Atraso e medido do FIM do dia de vencimento no fuso da casa.
// 2025-07-10 00:00 em Sao Paulo = 2025-07-10T03:00Z; o prazo termina em 2025-07-11T03:00Z.
//   e1  2025-07-10T12:00Z -> 12h - 27h = -15h  (adiantada)
//   e2  2025-07-12T12:00Z -> 60h - 27h = +33h
//   e3  2025-07-11T14:00Z -> 38h - 27h = +11h
// media = (-15 + 33 + 11) / 3 = 9,666... -> 9.67
const CONCLUSAO_E1 = new Date('2025-07-10T12:00:00.000Z');
const CONCLUSAO_E2 = new Date('2025-07-12T12:00:00.000Z');
const CONCLUSAO_E3 = new Date('2025-07-11T14:00:00.000Z');

async function cenario() {
  const owner = await createOwner();
  const adult = await addMember(owner.token, owner.household.id, 'adult');
  const child = await addMember(owner.token, owner.household.id, 'child');

  // Seis TAREFAS distintas: o indice unico {task, dueDate} impede duas ocorrencias da
  // mesma tarefa no mesmo dia — e e ele que garante a idempotencia do gerador.
  const nomes = [
    'Limpar banheiro',
    'Lavar louca',
    'Tirar o lixo',
    'Passar aspirador',
    'Trocar roupa de cama',
    'Regar plantas',
  ];

  const taskIds = {};
  for (const nome of nomes) {
    const tarefa = await createTask(owner.token, owner.household.id, {
      name: nome,
      recurrence: { frequency: 'ocasional', startDate: VENCIMENTO },
    });

    taskIds[nome] = tarefa.body.data.id;
  }

  // A fixture e gravada do zero: as ocorrencias geradas automaticamente saem.
  await TaskOccurrence.deleteMany({ household: owner.household.id });

  const base = { household: owner.household.id, dueDate: VENCIMENTO };

  const [o1, o2, o3, o4, o5, o6] = await TaskOccurrence.create([
    { ...base, task: taskIds['Limpar banheiro'], status: 'done', points: 5, assignedTo: child.membership.user.id },
    { ...base, task: taskIds['Lavar louca'], status: 'done', points: 3, assignedTo: null },
    { ...base, task: taskIds['Tirar o lixo'], status: 'done', points: 8, assignedTo: adult.membership.user.id },
    { ...base, task: taskIds['Passar aspirador'], status: 'overdue', points: 5, assignedTo: child.membership.user.id },
    { ...base, task: taskIds['Trocar roupa de cama'], status: 'skipped', points: 2, assignedTo: adult.membership.user.id },
    { ...base, task: taskIds['Regar plantas'], status: 'pending', points: 1, assignedTo: null },
  ]);

  const taskId = taskIds['Limpar banheiro'];

  await TaskExecution.create([
    {
      household: owner.household.id,
      occurrence: o1._id,
      task: taskIds['Limpar banheiro'],
      dueDate: VENCIMENTO,
      executedBy: child.membership.user.id,
      completionDate: CONCLUSAO_E1,
      status: 'approved',
      points: 5,
      rating: 5,
      ratedBy: owner.household.ownerId,
      ratedAt: CONCLUSAO_E1,
    },
    {
      household: owner.household.id,
      occurrence: o2._id,
      task: taskIds['Lavar louca'],
      dueDate: VENCIMENTO,
      executedBy: adult.membership.user.id,
      completionDate: CONCLUSAO_E2,
      status: 'approved',
      points: 3,
      rating: 4,
      ratedBy: owner.household.ownerId,
      ratedAt: CONCLUSAO_E2,
    },
    {
      household: owner.household.id,
      occurrence: o3._id,
      task: taskIds['Tirar o lixo'],
      dueDate: VENCIMENTO,
      executedBy: child.membership.user.id,
      completionDate: CONCLUSAO_E3,
      status: 'auto_approved',
      points: 8,
    },
  ]);

  return { owner, adult, child, taskId, taskIds, ocorrencias: { o1, o2, o3, o4, o5, o6 } };
}

describe('janela do periodo', () => {
  const casa = { timezone: TZ };

  it('a semana comeca no domingo', () => {
    // 2025-07-10 e uma quinta-feira.
    const quinta = new Date('2025-07-10T15:00:00.000Z');

    expect(periodWindow('week', casa, quinta)).toEqual({
      from: '2025-07-06',
      to: '2025-07-12',
    });
  });

  it('domingo e o proprio inicio da semana', () => {
    const domingo = new Date('2025-07-13T15:00:00.000Z');

    expect(periodWindow('week', casa, domingo)).toEqual({
      from: '2025-07-13',
      to: '2025-07-19',
    });
  });

  it('o mes e o calendario cheio', () => {
    expect(periodWindow('month', casa, new Date('2025-07-10T15:00:00.000Z'))).toEqual({
      from: '2025-07-01',
      to: '2025-07-31',
    });
  });

  it('o dia da casa manda, nao o do servidor', () => {
    // 02:00 UTC do dia 1 de agosto ainda e 31 de julho em Sao Paulo.
    const instante = new Date('2025-08-01T02:00:00.000Z');

    expect(periodWindow('month', casa, instante)).toEqual({
      from: '2025-07-01',
      to: '2025-07-31',
    });
  });
});

describe('GET /households/:id/stats', () => {
  it('totais exatos da fixture', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    expect(response.status).toBe(200);

    const { totals } = response.body.data;
    expect(totals).toEqual({
      occurrences: 6,
      completed: 3,
      overdue: 1,
      skipped: 1,
      completionRate: 0.5,
      onTimeRate: 0.3333,
      avgCompletionDelayHours: 9.67,
    });
  });

  it('por membro, incluindo quem nao fez nada', async () => {
    const { owner, adult, child } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    const porUsuario = {};
    response.body.data.byMember.forEach((linha) => {
      porUsuario[linha.user.id] = linha;
    });

    // O owner nao executou nada e mesmo assim aparece, zerado.
    expect(Object.keys(porUsuario)).toHaveLength(3);

    expect(porUsuario[child.membership.user.id]).toEqual({
      user: {
        id: child.membership.user.id,
        name: child.user.name,
        username: child.user.username,
      },
      points: 13,
      completed: 2,
      overdue: 1,
      skipped: 0,
      onTimeRate: 0.5,
      avgRating: 5,
    });

    expect(porUsuario[adult.membership.user.id]).toEqual({
      user: {
        id: adult.membership.user.id,
        name: adult.user.name,
        username: adult.user.username,
      },
      points: 3,
      completed: 1,
      overdue: 0,
      skipped: 1,
      onTimeRate: 0,
      avgRating: 4,
    });

    expect(porUsuario[owner.household.ownerId]).toEqual({
      user: {
        id: owner.household.ownerId,
        name: owner.user.name,
        username: owner.user.username,
      },
      points: 0,
      completed: 0,
      overdue: 0,
      skipped: 0,
      onTimeRate: 0,
      avgRating: null,
    });
  });

  it('por tarefa, com o atraso medio', async () => {
    const { owner, taskIds } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    // Ordenado por atrasadas desc, depois ocorrencias desc, depois nome.
    expect(response.body.data.byTask).toEqual([
      { taskId: taskIds['Passar aspirador'], name: 'Passar aspirador', occurrences: 1, completed: 0, overdue: 1, avgCompletionDelayHours: 0 },
      { taskId: taskIds['Lavar louca'], name: 'Lavar louca', occurrences: 1, completed: 1, overdue: 0, avgCompletionDelayHours: 33 },
      { taskId: taskIds['Limpar banheiro'], name: 'Limpar banheiro', occurrences: 1, completed: 1, overdue: 0, avgCompletionDelayHours: -15 },
      { taskId: taskIds['Regar plantas'], name: 'Regar plantas', occurrences: 1, completed: 0, overdue: 0, avgCompletionDelayHours: 0 },
      { taskId: taskIds['Tirar o lixo'], name: 'Tirar o lixo', occurrences: 1, completed: 1, overdue: 0, avgCompletionDelayHours: 11 },
      { taskId: taskIds['Trocar roupa de cama'], name: 'Trocar roupa de cama', occurrences: 1, completed: 0, overdue: 0, avgCompletionDelayHours: 0 },
    ]);
  });

  it('janela vazia nao quebra e nao divide por zero', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=2020-01-01&to=2020-01-31')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toEqual({
      occurrences: 0,
      completed: 0,
      overdue: 0,
      skipped: 0,
      completionRate: 0,
      onTimeRate: 0,
      avgCompletionDelayHours: 0,
    });
    expect(response.body.data.byMember).toHaveLength(3);
    expect(response.body.data.byTask).toEqual([]);
  });

  it('from posterior a to -> 400', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=2025-08-01&to=2025-07-01')
      .set(bearer(owner.token));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('quem nao e membro -> 403 NOT_HOUSEHOLD_MEMBER', async () => {
    const { owner } = await cenario();
    const estranho = await createOwner({ name: 'Outra casa' });

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats')
      .set(bearer(estranho.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });
});

describe('GET /households/:id/leaderboard', () => {
  it('ordena por pontos e desempata pela pontualidade', async () => {
    const { owner, adult, child } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/leaderboard?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    expect(response.status).toBe(200);

    const posicoes = response.body.data.entries.map((entry) => ({
      position: entry.position,
      id: entry.user.id,
      points: entry.points,
      completed: entry.completed,
      onTimeRate: entry.onTimeRate,
    }));

    expect(posicoes).toEqual([
      { position: 1, id: child.membership.user.id, points: 13, completed: 2, onTimeRate: 0.5 },
      { position: 2, id: adult.membership.user.id, points: 3, completed: 1, onTimeRate: 0 },
      { position: 3, id: owner.household.ownerId, points: 0, completed: 0, onTimeRate: 0 },
    ]);
  });

  it('o periodo week devolve uma janela que comeca no domingo', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/leaderboard?period=week')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.period).toBe('week');
    expect(new Date(response.body.data.from + 'T12:00:00Z').getUTCDay()).toBe(0);
    // Seis dias depois do domingo e sabado.
    expect(new Date(response.body.data.to + 'T12:00:00Z').getUTCDay()).toBe(6);
  });

  it('period=all alcanca a primeira ocorrencia da casa', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/leaderboard?period=all')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.period).toBe('all');
    expect(response.body.data.from).toBe(VENCIMENTO);
  });
});

describe('GET /me/score', () => {
  it('devolve pontos e posicao de quem executa', async () => {
    const { child } = await cenario();

    const response = await request(app)
      .get(
        '/api/v1/me/score?householdId=' +
          child.membership.householdId +
          '&from=' +
          JANELA.from +
          '&to=' +
          JANELA.to
      )
      .set(bearer(child.token));

    expect(response.status).toBe(200);
    expect(response.body.data.points).toBe(13);
    expect(response.body.data.completed).toBe(2);
    expect(response.body.data.position).toBe(1);
    expect(response.body.data.user.id).toBe(child.membership.user.id);
  });

  it('quem nao e membro -> 403', async () => {
    const { child } = await cenario();
    const estranho = await createOwner({ name: 'Outra casa' });

    const response = await request(app)
      .get('/api/v1/me/score?householdId=' + child.membership.householdId)
      .set(bearer(estranho.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });

  it('sem householdId -> 400', async () => {
    const { child } = await cenario();

    const response = await request(app).get('/api/v1/me/score').set(bearer(child.token));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('agregacao ignora o que esta fora da janela', () => {
  it('ocorrencia de outro mes nao entra no relatorio', async () => {
    const { owner, taskId } = await cenario();

    await TaskOccurrence.create([
      { household: owner.household.id, task: taskId, dueDate: '2025-06-30', status: 'overdue', points: 5 },
      { household: owner.household.id, task: taskId, dueDate: '2025-08-01', status: 'overdue', points: 5 },
    ]);

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    expect(response.body.data.totals.occurrences).toBe(6);
    expect(response.body.data.totals.overdue).toBe(1);
  });

  it('a tarefa e resolvida por lookup, nao por copia', async () => {
    const { owner, taskIds } = await cenario();
    const taskId = taskIds['Passar aspirador'];

    await Task.updateOne({ _id: taskId }, { $set: { name: 'Aspirador' } });

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/stats?from=' + JANELA.from + '&to=' + JANELA.to)
      .set(bearer(owner.token));

    expect(response.body.data.byTask[0].name).toBe('Aspirador');
  });
});
