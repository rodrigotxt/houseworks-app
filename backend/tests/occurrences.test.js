// tests/occurrences.test.js
// Fase 2 — a agenda: geracao, idempotencia, backfill, atraso e rodizio.

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const { createTask, seedOccurrence } = require('./helpers/fixtures');
const { ensureForHousehold, markOverdue } = require('../services/occurrences');
const { todayInZone, addDays } = require('../services/time');
const Household = require('../models/Household');
const TaskOccurrence = require('../models/TaskOccurrence');

const TZ = 'America/Sao_Paulo';
const AGENDA = '/api/v1/households/';

function hoje() {
  return todayInZone(TZ);
}

function diaria(extra) {
  return Object.assign({ frequency: 'diaria', startDate: hoje() }, extra || {});
}

describe('geracao de ocorrencias', () => {
  it('criar uma tarefa diaria materializa o horizonte da casa', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    expect(criada.status).toBe(201);

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences')
      .set(bearer(owner.token));

    // Horizonte padrao de 30 dias, incluindo hoje.
    expect(agenda.status).toBe(200);
    expect(agenda.body.meta.total).toBe(31);
    expect(agenda.body.data[0].dueDate).toBe(hoje());
    expect(agenda.body.data[0].status).toBe('pending');
  });

  it('a ocorrencia traz o resumo da tarefa e o taskId', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences')
      .set(bearer(owner.token));

    const ocorrencia = agenda.body.data[0];

    expect(ocorrencia.task.name).toBe('Limpar banheiro');
    expect(ocorrencia.task.difficulty).toBe('dificil');
    expect(ocorrencia.taskId).toBe(criada.body.data.id);
    expect(ocorrencia.points).toBe(5);
  });

  it('gerar duas vezes nao duplica (idempotencia pelo indice unico)', async () => {
    const owner = await createOwner();
    await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const household = await Household.findById(owner.household.id);
    const antes = await TaskOccurrence.countDocuments({ household: household._id });

    const primeiraRepeticao = await ensureForHousehold(household, {});
    const segundaRepeticao = await ensureForHousehold(household, {});

    const depois = await TaskOccurrence.countDocuments({ household: household._id });

    expect(primeiraRepeticao).toBe(0);
    expect(segundaRepeticao).toBe(0);
    expect(depois).toBe(antes);
  });

  it('backfill: pedir uma janela alem do horizonte gera ate la', async () => {
    const owner = await createOwner();
    await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const alvo = addDays(hoje(), 60);

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?from=' + hoje() + '&to=' + alvo)
      .set(bearer(owner.token));

    expect(agenda.status).toBe(200);
    expect(agenda.body.meta.total).toBe(61);
  });

  it('endDate limita a geracao', async () => {
    const owner = await createOwner();
    await createTask(owner.token, owner.household.id, {
      recurrence: diaria({ endDate: addDays(hoje(), 2) }),
    });

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?from=' + hoje() + '&to=' + addDays(hoje(), 10))
      .set(bearer(owner.token));

    expect(agenda.body.meta.total).toBe(3);
  });

  it('tarefa arquivada para de gerar', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    await request(app)
      .delete('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(owner.token))
      .expect(204);

    const household = await Household.findById(owner.household.id);
    const criadas = await ensureForHousehold(household, { untilDate: addDays(hoje(), 90) });

    expect(criadas).toBe(0);
  });

  it('rodizio distribui as ocorrencias entre os membros', async () => {
    const owner = await createOwner();
    await addMember(owner.token, owner.household.id, 'adult');
    await addMember(owner.token, owner.household.id, 'child');

    await createTask(owner.token, owner.household.id, {
      assignmentStrategy: 'rotate',
      recurrence: diaria(),
    });

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?from=' + hoje() + '&to=' + addDays(hoje(), 5))
      .set(bearer(owner.token));

    const responsaveis = agenda.body.data.map((ocorrencia) =>
      ocorrencia.assignedTo ? ocorrencia.assignedTo.id : null
    );

    // Tres membros, seis dias: todos aparecem e nenhum fica de fora.
    expect(new Set(responsaveis).size).toBe(3);
    expect(responsaveis.every(Boolean)).toBe(true);
  });

  it('rodizio com responsavel fixo -> 400', async () => {
    const owner = await createOwner();

    const response = await createTask(owner.token, owner.household.id, {
      assignmentStrategy: 'rotate',
      assignedTo: owner.household.ownerId,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'assignedTo' })])
    );
  });
});

describe('atraso', () => {
  it('ocorrencia vencida vira overdue na leitura da agenda', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const vencida = await seedOccurrence({
      household: owner.household.id,
      task: criada.body.data.id,
      dueDate: addDays(hoje(), -1),
    });

    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?from=' + addDays(hoje(), -7) + '&to=' + hoje())
      .set(bearer(owner.token));

    const encontrada = agenda.body.data.find((ocorrencia) => ocorrencia.id === vencida.id);

    expect(encontrada.status).toBe('overdue');
  });

  it('a tolerancia da casa adia o atraso', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    // Instante fixo: 10/07/2025 12:00 em Sao Paulo.
    const agora = new Date('2025-07-10T15:00:00.000Z');

    const nove = await seedOccurrence({
      household: owner.household.id,
      task: criada.body.data.id,
      dueDate: '2025-07-09',
    });
    const oito = await seedOccurrence({
      household: owner.household.id,
      task: criada.body.data.id,
      dueDate: '2025-07-08',
    });

    const household = await Household.findById(owner.household.id);

    // Sem tolerancia, ontem (09) ja venceu.
    await markOverdue(household, { now: agora });
    expect((await TaskOccurrence.findById(nove._id)).status).toBe('overdue');
    expect((await TaskOccurrence.findById(oito._id)).status).toBe('overdue');

    // Com 24h de tolerancia, a ocorrencia do dia 09 volta a ser aceitavel.
    await TaskOccurrence.updateMany(
      { _id: { $in: [nove._id, oito._id] } },
      { $set: { status: 'pending' } }
    );
    household.overdueGraceHours = 24;
    await household.save();

    await markOverdue(household, { now: agora });

    expect((await TaskOccurrence.findById(nove._id)).status).toBe('pending');
    expect((await TaskOccurrence.findById(oito._id)).status).toBe('overdue');
  });
});

describe('minha agenda', () => {
  it('traz as designadas a mim e as sem responsavel', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    await createTask(owner.token, owner.household.id, {
      name: 'Tarefa do filho',
      assignedTo: child.membership.user.id,
      recurrence: diaria(),
    });
    await createTask(owner.token, owner.household.id, {
      name: 'Tarefa de todos',
      assignedTo: null,
      recurrence: diaria(),
    });
    await createTask(owner.token, owner.household.id, {
      name: 'Tarefa de outro',
      assignedTo: owner.household.ownerId,
      recurrence: diaria(),
    });

    const response = await request(app)
      .get('/api/v1/me/occurrences?from=' + hoje() + '&to=' + hoje())
      .set(bearer(child.token));

    const nomes = response.body.data.map((ocorrencia) => ocorrencia.task.name).sort();

    expect(response.status).toBe(200);
    expect(nomes).toEqual(['Tarefa de todos', 'Tarefa do filho']);
  });

  it('sem casa nenhuma devolve lista vazia, nao erro', async () => {
    const owner = await createOwner();
    const semCasa = await require('./helpers/auth').registerAndLogin();

    const response = await request(app)
      .get('/api/v1/me/occurrences')
      .set(bearer(semCasa.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(owner.household.id).toBeDefined();
  });
});

describe('escopo e isolamento', () => {
  it('quem nao e membro -> 403 NOT_HOUSEHOLD_MEMBER', async () => {
    const owner = await createOwner();
    const estranho = await createOwner({ name: 'Outra casa' });

    const response = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences')
      .set(bearer(estranho.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });

  it('ocorrencia de outra casa -> 404 OCCURRENCE_NOT_FOUND', async () => {
    const casaA = await createOwner({ name: 'Casa A' });
    const casaB = await createOwner({ name: 'Casa B' });

    const criada = await createTask(casaA.token, casaA.household.id, { recurrence: diaria() });
    const ocorrencia = await TaskOccurrence.findOne({ task: criada.body.data.id });

    const response = await request(app)
      .get('/api/v1/occurrences/' + ocorrencia.id)
      .set(bearer(casaB.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('OCCURRENCE_NOT_FOUND');
  });

  it('membro le o detalhe da ocorrencia', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });
    const ocorrencia = await TaskOccurrence.findOne({ task: criada.body.data.id });

    const response = await request(app)
      .get('/api/v1/occurrences/' + ocorrencia.id)
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.task.name).toBe('Limpar banheiro');
  });

  it('lista as ocorrencias de uma tarefa especifica', async () => {
    const owner = await createOwner();
    const primeira = await createTask(owner.token, owner.household.id, {
      name: 'Tarefa A',
      recurrence: diaria(),
    });
    await createTask(owner.token, owner.household.id, { name: 'Tarefa B', recurrence: diaria() });

    const response = await request(app)
      .get('/api/v1/tasks/' + primeira.body.data.id + '/occurrences?pageSize=5')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta.total).toBe(31);
  });
});

describe('filtros da agenda', () => {
  it('filtra por status', async () => {
    const owner = await createOwner();
    await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const pendentes = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?status=pending')
      .set(bearer(owner.token));
    const concluidas = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?status=done')
      .set(bearer(owner.token));

    expect(pendentes.body.meta.total).toBe(31);
    expect(concluidas.body.meta.total).toBe(0);
  });

  it('filtra por assignedTo=unassigned', async () => {
    const owner = await createOwner();
    await createTask(owner.token, owner.household.id, { name: 'De todos', recurrence: diaria() });
    await createTask(owner.token, owner.household.id, {
      name: 'Do owner',
      assignedTo: owner.household.ownerId,
      recurrence: diaria(),
    });

    const response = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?assignedTo=unassigned')
      .set(bearer(owner.token));

    expect(response.body.meta.total).toBe(31);
    expect(response.body.data.every((ocorrencia) => ocorrencia.assignedTo === null)).toBe(true);
  });
});

describe('alteracao de recorrencia', () => {
  it('nao reescreve o passado, mas regenera o futuro', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { recurrence: diaria() });

    const passada = await seedOccurrence({
      household: owner.household.id,
      task: criada.body.data.id,
      dueDate: addDays(hoje(), -3),
      status: 'done',
      completedAt: new Date(),
    });

    const response = await request(app)
      .patch('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(owner.token))
      .send({ recurrence: { frequency: 'semanal', weekdays: [1], startDate: hoje() } });

    expect(response.status).toBe(200);

    // A ocorrencia passada e concluida continua intacta.
    const preservada = await request(app)
      .get('/api/v1/occurrences/' + passada.id)
      .set(bearer(owner.token));

    expect(preservada.status).toBe(200);
    expect(preservada.body.data.status).toBe('done');

    // O futuro agora segue a regra nova: so as segundas-feiras.
    const agenda = await request(app)
      .get(AGENDA + owner.household.id + '/occurrences?from=' + hoje() + '&to=' + addDays(hoje(), 28))
      .set(bearer(owner.token));

    const diasDaSemana = agenda.body.data.map((ocorrencia) =>
      new Date(ocorrencia.dueDate + 'T12:00:00.000Z').getUTCDay()
    );

    expect(diasDaSemana.length).toBeGreaterThan(0);
    expect(diasDaSemana.every((dia) => dia === 1)).toBe(true);
  });
});
