// tests/executions.test.js
// Fase 3 — ciclo de vida: concluir, pular, desfazer, avaliar e auto-aprovar.

const mongoose = require('mongoose');

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const { createTask, firstOccurrence, completeOccurrence } = require('./helpers/fixtures');
const { todayInZone, addDays } = require('../services/time');
const TaskExecution = require('../models/TaskExecution');
const TaskOccurrence = require('../models/TaskOccurrence');

const TZ = 'America/Sao_Paulo';

function hoje() {
  return todayInZone(TZ);
}

// Cenario padrao: casa com owner, adult e child, e uma tarefa semanal.
async function cenario(opcoes) {
  const owner = await createOwner();
  const adult = await addMember(owner.token, owner.household.id, 'adult');
  const child = await addMember(owner.token, owner.household.id, 'child');

  const criada = await createTask(
    owner.token,
    owner.household.id,
    Object.assign({ recurrence: { frequency: 'diaria', startDate: hoje() } }, (opcoes || {}).task)
  );

  const ocorrencia = await firstOccurrence(owner.household.id, criada.body.data.id);

  return { owner, adult, child, taskId: criada.body.data.id, occurrenceId: ocorrencia.id };
}

// Sem "async" de proposito: embrulhar em async devolveria um Promise comum e perderia
// o .expect() do supertest.
function completar(token, occurrenceId, body) {
  return completeOccurrence(token, occurrenceId, body);
}

describe('concluir ocorrencia', () => {
  it('cria a execucao em pending_review e fecha a ocorrencia', async () => {
    const { owner, child, occurrenceId } = await cenario();

    const response = await completar(child.token, occurrenceId, { note: 'Feito!' });

    expect(response.status).toBe(201);
    expect(response.body.data.occurrence.status).toBe('done');
    expect(response.body.data.execution.status).toBe('pending_review');
    expect(response.body.data.execution.executedBy.id).toBe(child.membership.user.id);
    expect(response.body.data.execution.note).toBe('Feito!');
    // Pontos copiados da ocorrencia (tarefa 'dificil' = 5).
    expect(response.body.data.execution.points).toBe(5);

    const naAgenda = await request(app)
      .get('/api/v1/occurrences/' + occurrenceId)
      .set(bearer(owner.token));

    expect(naAgenda.body.data.status).toBe('done');
    expect(naAgenda.body.data.completedBy.id).toBe(child.membership.user.id);
  });

  it('grava o tempo real informado e a estimativa vigente', async () => {
    const { child, occurrenceId } = await cenario({ task: { estimatedMinutes: 45 } });

    const response = await completar(child.token, occurrenceId, { actualMinutes: 52 });

    expect(response.status).toBe(201);
    expect(response.body.data.execution.actualMinutes).toBe(52);
    expect(response.body.data.execution.estimatedMinutes).toBe(45);
  });

  it('sem tempo informado, actualMinutes fica null (e nao a estimativa)', async () => {
    const { child, occurrenceId } = await cenario({ task: { estimatedMinutes: 45 } });

    const response = await completar(child.token, occurrenceId, {});

    // null significa "nao informado". Quem le aplica actual ?? estimated. Gravar a
    // estimativa aqui apagaria a diferenca entre tempo medido e tempo presumido, que e
    // o unico motivo de o campo existir.
    expect(response.body.data.execution.actualMinutes).toBeNull();
    expect(response.body.data.execution.estimatedMinutes).toBe(45);
  });

  it('tarefa sem estimativa e sem tempo informado: os dois ficam null', async () => {
    const { child, occurrenceId } = await cenario();

    const response = await completar(child.token, occurrenceId, {});

    expect(response.body.data.execution.actualMinutes).toBeNull();
    expect(response.body.data.execution.estimatedMinutes).toBeNull();
  });

  it('mudar a estimativa da tarefa depois nao reescreve a execucao', async () => {
    const { owner, child, taskId, occurrenceId } = await cenario({
      task: { estimatedMinutes: 30 },
    });

    const concluida = await completar(child.token, occurrenceId, { actualMinutes: 40 });
    const executionId = concluida.body.data.execution.id;

    await request(app)
      .patch('/api/v1/tasks/' + taskId)
      .set(bearer(owner.token))
      .send({ estimatedMinutes: 90 });

    const depois = await request(app)
      .get('/api/v1/executions/' + executionId)
      .set(bearer(owner.token));

    // O retrato do momento da conclusao nao muda: e o que permite comparar depois.
    expect(depois.body.data.estimatedMinutes).toBe(30);
    expect(depois.body.data.actualMinutes).toBe(40);
  });

  it('rejeita tempo real negativo -> 400', async () => {
    const { child, occurrenceId } = await cenario();

    const response = await completar(child.token, occurrenceId, { actualMinutes: -5 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita tempo real fracionado -> 400', async () => {
    const { child, occurrenceId } = await cenario();

    const response = await completar(child.token, occurrenceId, { actualMinutes: 12.5 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('concluir de novo -> 409 OCCURRENCE_ALREADY_COMPLETED', async () => {
    const { owner, occurrenceId } = await cenario();

    await completar(owner.token, occurrenceId).expect(201);

    const response = await completar(owner.token, occurrenceId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OCCURRENCE_ALREADY_COMPLETED');
  });

  it('child nao conclui ocorrencia designada a outro membro', async () => {
    const owner = await createOwner();
    const outro = await addMember(owner.token, owner.household.id, 'child');
    const child = await addMember(owner.token, owner.household.id, 'child');

    const criada = await createTask(owner.token, owner.household.id, {
      assignedTo: outro.membership.user.id,
      recurrence: { frequency: 'diaria', startDate: hoje() },
    });
    const ocorrencia = await firstOccurrence(owner.household.id, criada.body.data.id);

    const response = await completar(child.token, ocorrencia.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OCCURRENCE_NOT_ASSIGNED_TO_YOU');
  });

  it('child conclui a propria ocorrencia', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const criada = await createTask(owner.token, owner.household.id, {
      assignedTo: child.membership.user.id,
      recurrence: { frequency: 'diaria', startDate: hoje() },
    });
    const ocorrencia = await firstOccurrence(owner.household.id, criada.body.data.id);

    await completar(child.token, ocorrencia.id).expect(201);
  });

  it('child conclui ocorrencia sem responsavel', async () => {
    const { child, occurrenceId } = await cenario();

    await completar(child.token, occurrenceId).expect(201);
  });

  it('o adulto conclui qualquer ocorrencia', async () => {
    const { adult, occurrenceId } = await cenario();

    await completar(adult.token, occurrenceId).expect(201);
  });

  it('aceita registro retroativo dentro de 7 dias', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await completar(owner.token, occurrenceId, {
      completionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(response.status).toBe(201);
  });

  it('recusa registro retroativo acima de 7 dias', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await completar(owner.token, occurrenceId, {
      completionDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'completionDate' })])
    );
  });

  it('recusa data de conclusao no futuro', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await completar(owner.token, occurrenceId, {
      completionDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

    expect(response.status).toBe(400);
  });

  it('marca isLate quando concluida depois do vencimento', async () => {
    const { owner, occurrenceId } = await cenario();

    // Empurra o vencimento para tras: a ocorrencia ja estava vencida.
    await TaskOccurrence.updateOne({ _id: occurrenceId }, { $set: { dueDate: addDays(hoje(), -1) } });

    const response = await completar(owner.token, occurrenceId);

    expect(response.status).toBe(201);
    expect(response.body.data.occurrence.isLate).toBe(true);
  });

  it('nao marca isLate quando concluida no prazo', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await completar(owner.token, occurrenceId);

    expect(response.body.data.occurrence.isLate).toBe(false);
  });
});

describe('pular ocorrencia', () => {
  it('owner pula com justificativa', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/skip')
      .set(bearer(owner.token))
      .send({ reason: 'Viajamos no fim de semana.' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('skipped');
    expect(response.body.data.skippedReason).toBe('Viajamos no fim de semana.');
  });

  it('child nao pula -> 403 INSUFFICIENT_ROLE', async () => {
    const { child, occurrenceId } = await cenario();

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/skip')
      .set(bearer(child.token))
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('pular uma ocorrencia concluida -> 409', async () => {
    const { owner, occurrenceId } = await cenario();

    await completar(owner.token, occurrenceId).expect(201);

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/skip')
      .set(bearer(owner.token))
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OCCURRENCE_ALREADY_COMPLETED');
  });

  it('concluir uma ocorrencia pulada -> 409', async () => {
    const { owner, occurrenceId } = await cenario();

    await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/skip')
      .set(bearer(owner.token))
      .send({})
      .expect(200);

    const response = await completar(owner.token, occurrenceId);

    expect(response.status).toBe(409);
  });
});

describe('desfazer conclusao', () => {
  it('owner desfaz: ocorrencia volta a pendente e a execucao some', async () => {
    const { owner, occurrenceId } = await cenario();

    await completar(owner.token, occurrenceId).expect(201);

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(owner.token))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.completedAt).toBeNull();

    const execucoes = await request(app)
      .get('/api/v1/occurrences/' + occurrenceId + '/executions')
      .set(bearer(owner.token));

    expect(execucoes.body.data).toEqual([]);
  });

  it('concluir -> avaliar -> desfazer devolve os pontos a zero', async () => {
    const { owner, child, occurrenceId } = await cenario();
    const householdId = owner.household.id;

    const conclusao = await completar(child.token, occurrenceId).expect(201);
    const executionId = conclusao.body.data.execution.id;

    await request(app)
      .patch('/api/v1/executions/' + executionId + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 5 })
      .expect(200);

    const pontos = async () => {
      const linhas = await TaskExecution.aggregate([
        {
          // Aggregation nao converte string para ObjectId — o cast e obrigatorio.
          $match: {
            household: new mongoose.Types.ObjectId(String(householdId)),
            status: { $in: ['approved', 'auto_approved'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$points' } } },
      ]);

      return linhas.length ? linhas[0].total : 0;
    };

    expect(await pontos()).toBe(5);

    await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(owner.token))
      .send({})
      .expect(200);

    // A execucao some junto: os pontos saem do placar sem nenhum ajuste manual.
    expect(await pontos()).toBe(0);
  });

  it('quem executou desfaz dentro da janela', async () => {
    const { child, occurrenceId } = await cenario();

    await completar(child.token, occurrenceId).expect(201);

    await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(child.token))
      .send({})
      .expect(200);
  });

  it('outro membro que nao executou e nao e owner -> 403', async () => {
    const { adult, child, occurrenceId } = await cenario();

    await completar(child.token, occurrenceId).expect(201);

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(adult.token))
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('ocorrencia nao concluida -> 409 OCCURRENCE_NOT_COMPLETED', async () => {
    const { owner, occurrenceId } = await cenario();

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(owner.token))
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('OCCURRENCE_NOT_COMPLETED');
  });

  it('ocorrencia vencida volta como overdue, nao como pending', async () => {
    const { owner, occurrenceId } = await cenario();

    await TaskOccurrence.updateOne({ _id: occurrenceId }, { $set: { dueDate: addDays(hoje(), -1) } });
    await completar(owner.token, occurrenceId).expect(201);

    const response = await request(app)
      .post('/api/v1/occurrences/' + occurrenceId + '/undo')
      .set(bearer(owner.token))
      .send({});

    expect(response.body.data.status).toBe('overdue');
  });
});

describe('avaliacao', () => {
  it('outro membro avalia: approved, com ratedBy e ratingNote', async () => {
    const { owner, child, occurrenceId } = await cenario();

    const conclusao = await completar(child.token, occurrenceId).expect(201);

    const response = await request(app)
      .patch('/api/v1/executions/' + conclusao.body.data.execution.id + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 5, note: 'Ficou otimo!' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('approved');
    expect(response.body.data.rating).toBe(5);
    expect(response.body.data.ratingNote).toBe('Ficou otimo!');
    expect(response.body.data.ratedBy.id).toBe(owner.household.ownerId);
    expect(response.body.data.ratedAt).not.toBeNull();
  });

  it('quem executou nao avalia a propria execucao', async () => {
    const { adult, occurrenceId } = await cenario();

    const conclusao = await completar(adult.token, occurrenceId).expect(201);

    const response = await request(app)
      .patch('/api/v1/executions/' + conclusao.body.data.execution.id + '/rating')
      .set(bearer(adult.token))
      .send({ rating: 5 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CANNOT_RATE_OWN_EXECUTION');
  });

  it('avaliar duas vezes -> 409 EXECUTION_ALREADY_RATED', async () => {
    const { owner, adult, occurrenceId } = await cenario();

    const conclusao = await completar(adult.token, occurrenceId).expect(201);
    const url = '/api/v1/executions/' + conclusao.body.data.execution.id + '/rating';

    await request(app).patch(url).set(bearer(owner.token)).send({ rating: 4 }).expect(200);

    const response = await request(app).patch(url).set(bearer(owner.token)).send({ rating: 5 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EXECUTION_ALREADY_RATED');
  });

  it('child sem canRate nao avalia -> 403 INSUFFICIENT_ROLE', async () => {
    const { adult, child, occurrenceId } = await cenario();

    const conclusao = await completar(adult.token, occurrenceId).expect(201);

    const response = await request(app)
      .patch('/api/v1/executions/' + conclusao.body.data.execution.id + '/rating')
      .set(bearer(child.token))
      .send({ rating: 5 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('avaliacao fora de 1..5 -> 400', async () => {
    const { owner, child, occurrenceId } = await cenario();

    const conclusao = await completar(child.token, occurrenceId).expect(201);

    const response = await request(app)
      .patch('/api/v1/executions/' + conclusao.body.data.execution.id + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 9 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('execucao de outra casa -> 404 EXECUTION_NOT_FOUND', async () => {
    const casaA = await cenario();
    const casaB = await createOwner({ name: 'Casa B' });

    const conclusao = await completar(casaA.child.token, casaA.occurrenceId).expect(201);

    const response = await request(app)
      .get('/api/v1/executions/' + conclusao.body.data.execution.id)
      .set(bearer(casaB.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
  });
});

describe('auto-aprovacao da janela', () => {
  it('execucao fora da janela vira auto_approved na leitura da lista', async () => {
    const { owner, child, occurrenceId } = await cenario();

    // Concluida 5 dias atras: fora da janela padrao de 72h.
    const conclusao = await completar(child.token, occurrenceId, {
      completionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    }).expect(201);

    expect(conclusao.body.data.execution.status).toBe('pending_review');

    const lista = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions')
      .set(bearer(owner.token));

    const encontrada = lista.body.data.find((item) => item.id === conclusao.body.data.execution.id);

    expect(encontrada.status).toBe('auto_approved');
    expect(encontrada.rating).toBeNull();
    expect(encontrada.ratedBy).toBeNull();
  });

  it('avaliar uma execucao ja auto-aprovada -> 409 EXECUTION_ALREADY_RATED', async () => {
    const { owner, child, occurrenceId } = await cenario();

    const conclusao = await completar(child.token, occurrenceId, {
      completionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    }).expect(201);

    await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions')
      .set(bearer(owner.token))
      .expect(200);

    const response = await request(app)
      .patch('/api/v1/executions/' + conclusao.body.data.execution.id + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 5 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EXECUTION_ALREADY_RATED');
  });

  it('execucao recente continua aguardando avaliacao', async () => {
    const { owner, child, occurrenceId } = await cenario();

    const conclusao = await completar(child.token, occurrenceId).expect(201);

    const lista = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions')
      .set(bearer(owner.token));

    const encontrada = lista.body.data.find((item) => item.id === conclusao.body.data.execution.id);

    expect(encontrada.status).toBe('pending_review');
  });
});

describe('fila de conferencia', () => {
  it('pendingReviewForMe traz o que falta avaliar e exclui o que eu mesmo fiz', async () => {
    const { owner, child, occurrenceId } = await cenario();

    // Uma feita pelo child (o owner pode avaliar) e outra pelo proprio owner (nao pode).
    await completar(child.token, occurrenceId).expect(201);

    const segundaTarefa = await createTask(owner.token, owner.household.id, {
      name: 'Outra tarefa',
      recurrence: { frequency: 'diaria', startDate: hoje() },
    });
    const outra = await firstOccurrence(owner.household.id, segundaTarefa.body.data.id);

    await completar(owner.token, outra.id).expect(201);

    const fila = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions?pendingReviewForMe=true')
      .set(bearer(owner.token));

    expect(fila.body.data).toHaveLength(1);
    expect(fila.body.data[0].executedBy.id).toBe(child.membership.user.id);
  });

  it('quem nao avalia ve fila vazia', async () => {
    const { child, occurrenceId } = await cenario();

    await completar(child.token, occurrenceId).expect(201);

    const fila = await request(app)
      .get('/api/v1/households/' + child.membership.householdId + '/executions?pendingReviewForMe=true')
      .set(bearer(child.token));

    expect(fila.body.data).toEqual([]);
  });
});
