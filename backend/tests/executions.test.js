// tests/executions.test.js
// Fase 1b — execucoes escopadas por casa e a regra "quem executou nao avalia".

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const { createTask, seedExecution } = require('./helpers/fixtures');

async function cenario() {
  const owner = await createOwner();
  const adult = await addMember(owner.token, owner.household.id, 'adult');
  const child = await addMember(owner.token, owner.household.id, 'child');

  const tarefa = await createTask(owner.token, owner.household.id);

  return { owner, adult, child, taskId: tarefa.body.data.id };
}

describe('listagem de execucoes', () => {
  it('lista as execucoes da casa (e nao apenas as do proprio usuario)', async () => {
    const { owner, child, taskId } = await cenario();

    await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
    });

    // O owner nao executou nada: antes da Fase 1 a listagem vinha vazia para ele.
    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].executedBy.username).toBe(child.user.username);
    expect(response.body.meta).toMatchObject({ total: 1 });
  });

  it('nao mistura execucoes de outra casa', async () => {
    const casaA = await cenario();
    const casaB = await cenario();

    await seedExecution({
      household: casaA.owner.household.id,
      task: casaA.taskId,
      executedBy: casaA.child.membership.user.id,
    });

    const response = await request(app)
      .get('/api/v1/households/' + casaB.owner.household.id + '/executions')
      .set(bearer(casaB.owner.token));

    expect(response.body.data).toEqual([]);
  });

  it('quem nao e membro -> 403 NOT_HOUSEHOLD_MEMBER', async () => {
    const { owner } = await cenario();
    const estranho = await createOwner({ name: 'Outra casa' });

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions')
      .set(bearer(estranho.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });

  it('filtra por executedBy', async () => {
    const { owner, child, adult, taskId } = await cenario();

    await seedExecution({ household: owner.household.id, task: taskId, executedBy: child.membership.user.id });
    await seedExecution({ household: owner.household.id, task: taskId, executedBy: adult.membership.user.id });

    const response = await request(app)
      .get(
        '/api/v1/households/' +
          owner.household.id +
          '/executions?executedBy=' +
          child.membership.user.id
      )
      .set(bearer(owner.token));

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].executedBy.username).toBe(child.user.username);
  });

  it('filtra por intervalo de datas', async () => {
    const { owner, child, taskId } = await cenario();

    await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
      completionDate: new Date('2025-03-10T12:00:00.000Z'),
    });

    const dentro = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions?from=2025-03-01&to=2025-03-31')
      .set(bearer(owner.token));
    const fora = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions?from=2025-04-01&to=2025-04-30')
      .set(bearer(owner.token));

    expect(dentro.body.data).toHaveLength(1);
    expect(fora.body.data).toHaveLength(0);
  });

  it('intervalo invertido -> 400', async () => {
    const { owner } = await cenario();

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/executions?from=2025-05-01&to=2025-01-01')
      .set(bearer(owner.token));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('execucao por id', () => {
  it('execucao de outra casa -> 404 EXECUTION_NOT_FOUND', async () => {
    const casaA = await cenario();
    const casaB = await cenario();

    const execucao = await seedExecution({
      household: casaA.owner.household.id,
      task: casaA.taskId,
      executedBy: casaA.child.membership.user.id,
    });

    const response = await request(app)
      .get('/api/v1/executions/' + execucao.id)
      .set(bearer(casaB.owner.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
  });

  it('membro da casa le a execucao', async () => {
    const { owner, child, taskId } = await cenario();

    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
    });

    const response = await request(app)
      .get('/api/v1/executions/' + execucao.id)
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(execucao.id);
  });
});

describe('avaliacao', () => {
  it('outro membro com canRate avalia -> 200', async () => {
    const { owner, child, taskId } = await cenario();

    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
    });

    const response = await request(app)
      .patch('/api/v1/executions/' + execucao.id + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 5, note: 'Ficou otimo!' });

    expect(response.status).toBe(200);
    expect(response.body.data.rating).toBe(5);
    // A nota do avaliador nao sobrescreve o comentario de quem executou.
    expect(response.body.data.ratingNote).toBe('Ficou otimo!');
    expect(response.body.data.note).toBe('Feito.');
  });

  it('quem executou nao pode avaliar a propria execucao', async () => {
    const { owner, adult, taskId } = await cenario();

    // O adult tem canRate: a barreira aqui e a regra de negocio, nao a permissao.
    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: adult.membership.user.id,
    });

    const response = await request(app)
      .patch('/api/v1/executions/' + execucao.id + '/rating')
      .set(bearer(adult.token))
      .send({ rating: 5 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CANNOT_RATE_OWN_EXECUTION');
  });

  it('child sem canRate nao avalia -> 403 INSUFFICIENT_ROLE', async () => {
    const { owner, child, adult, taskId } = await cenario();

    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: adult.membership.user.id,
    });

    const response = await request(app)
      .patch('/api/v1/executions/' + execucao.id + '/rating')
      .set(bearer(child.token))
      .send({ rating: 5 });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('a avaliacao e obrigatoria -> 400', async () => {
    const { owner, child, taskId } = await cenario();

    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
    });

    const response = await request(app)
      .patch('/api/v1/executions/' + execucao.id + '/rating')
      .set(bearer(owner.token))
      .send({ note: 'So um comentario' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'rating' })])
    );
  });

  it('avaliacao fora de 1..5 -> 400', async () => {
    const { owner, child, taskId } = await cenario();

    const execucao = await seedExecution({
      household: owner.household.id,
      task: taskId,
      executedBy: child.membership.user.id,
    });

    const response = await request(app)
      .patch('/api/v1/executions/' + execucao.id + '/rating')
      .set(bearer(owner.token))
      .send({ rating: 6 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
