// tests/tasks.test.js
// Fase 1b — tarefas escopadas por casa. O primeiro teste e a prova do P1.

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const { createTask } = require('./helpers/fixtures');

const TASK_URL = '/api/v1/households/';

describe('visibilidade e criacao', () => {
  it('P1: tarefa criada pelo owner e visivel para TODOS os membros da casa', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');
    const child = await addMember(owner.token, owner.household.id, 'child');

    const criada = await createTask(owner.token, owner.household.id);
    expect(criada.status).toBe(201);

    // Antes da Fase 1 a listagem filtrava por createdBy: a tarefa do owner era
    // invisivel para o resto da familia.
    for (const membro of [owner, adult, child]) {
      const lista = await request(app)
        .get(TASK_URL + owner.household.id + '/tasks')
        .set(bearer(membro.token));

      expect(lista.status).toBe(200);
      expect(lista.body.data.map((task) => task.name)).toContain('Limpar banheiro');
    }
  });

  it('child nao cria tarefa -> 403 INSUFFICIENT_ROLE', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await createTask(child.token, owner.household.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('adult cria tarefa -> 201', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');

    const response = await createTask(adult.token, owner.household.id);

    expect(response.status).toBe(201);
    expect(response.body.data.householdId).toBe(owner.household.id);
  });

  // Este teste existe porque a divergencia ja aconteceu: a API devolvia o id cru onde o
  // contrato promete um objeto. Escrever a tela de tarefas foi o que revelou.
  it('a forma segue o contrato: householdId e UserRef, nunca ids crus', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const criada = await createTask(owner.token, owner.household.id, {
      assignedTo: child.membership.user.id,
    });

    // householdId e string; a referencia crua nao vaza
    expect(criada.body.data.householdId).toBe(owner.household.id);
    expect(criada.body.data.household).toBeUndefined();

    // assignedTo e createdBy sao objetos prontos para exibir
    expect(criada.body.data.assignedTo).toEqual({
      id: child.membership.user.id,
      name: child.user.name,
      username: child.user.username,
    });
    expect(criada.body.data.createdBy.id).toBe(owner.household.ownerId);

    // e o mesmo vale na leitura da lista
    const lista = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks')
      .set(bearer(owner.token));

    expect(lista.body.data[0].householdId).toBe(owner.household.id);
    expect(lista.body.data[0].assignedTo.name).toBe(child.user.name);
    expect(lista.body.data[0].household).toBeUndefined();
  });

  it('cada casa so enxerga as proprias tarefas', async () => {
    const casaA = await createOwner({ name: 'Casa A' });
    const casaB = await createOwner({ name: 'Casa B' });

    await createTask(casaA.token, casaA.household.id, { name: 'Tarefa da casa A' });

    const listaB = await request(app)
      .get(TASK_URL + casaB.household.id + '/tasks')
      .set(bearer(casaB.token));

    expect(listaB.body.data).toEqual([]);
  });

  it('quem nao e membro -> 403 NOT_HOUSEHOLD_MEMBER', async () => {
    const owner = await createOwner();
    const estranho = await createOwner({ name: 'Outra casa' });

    const response = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks')
      .set(bearer(estranho.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });
});

describe('campos da tarefa', () => {
  it('pontos derivam da dificuldade', async () => {
    const owner = await createOwner();

    const facil = await createTask(owner.token, owner.household.id, { difficulty: 'facil' });
    const muitoDificil = await createTask(owner.token, owner.household.id, {
      name: 'Lavar a caixa de agua',
      difficulty: 'muito_dificil',
    });

    expect(facil.body.data.points).toBe(2);
    expect(muitoDificil.body.data.points).toBe(8);
  });

  it('pontos explicitos sobrepoem a derivacao', async () => {
    const owner = await createOwner();

    const response = await createTask(owner.token, owner.household.id, {
      difficulty: 'facil',
      points: 7,
    });

    expect(response.body.data.points).toBe(7);
  });

  it('assignedTo precisa ser membro da casa -> 400', async () => {
    const owner = await createOwner();
    const deOutraCasa = await createOwner({ name: 'Casa vizinha' });

    const response = await createTask(owner.token, owner.household.id, {
      assignedTo: deOutraCasa.household.ownerId,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'assignedTo' })])
    );
  });

  it('aceita null em assignedTo (qualquer um pode assumir)', async () => {
    const owner = await createOwner();

    const response = await createTask(owner.token, owner.household.id, { assignedTo: null });

    expect(response.status).toBe(201);
    expect(response.body.data.assignedTo).toBeNull();
    expect(response.body.data.householdId).toBe(owner.household.id);
  });

  it('rejeita campo fora do contrato (nextDueDate)', async () => {
    const owner = await createOwner();

    const response = await createTask(owner.token, owner.household.id, {
      nextDueDate: '2025-12-01',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('listagem', () => {
  it('filtra por assignedTo=unassigned', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    await createTask(owner.token, owner.household.id, { name: 'Tarefa de alguem', assignedTo: child.membership.user.id });
    await createTask(owner.token, owner.household.id, { name: 'Tarefa de todos', assignedTo: null });

    const response = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks?assignedTo=unassigned')
      .set(bearer(owner.token));

    expect(response.body.data.map((task) => task.name)).toEqual(['Tarefa de todos']);
  });

  it('busca textual por nome', async () => {
    const owner = await createOwner();

    await createTask(owner.token, owner.household.id, { name: 'Lavar louca' });
    await createTask(owner.token, owner.household.id, { name: 'Limpar banheiro' });

    const response = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks?q=louca')
      .set(bearer(owner.token));

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Lavar louca');
  });

  it('pagina e devolve meta', async () => {
    const owner = await createOwner();

    for (let index = 1; index <= 3; index += 1) {
      await createTask(owner.token, owner.household.id, { name: 'Tarefa numero ' + index });
    }

    const response = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks?page=1&pageSize=2')
      .set(bearer(owner.token));

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('por padrao nao lista tarefas arquivadas', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id);

    await request(app)
      .delete('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(owner.token))
      .expect(204);

    const ativas = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks')
      .set(bearer(owner.token));
    const arquivadas = await request(app)
      .get(TASK_URL + owner.household.id + '/tasks?status=archived')
      .set(bearer(owner.token));

    expect(ativas.body.data).toEqual([]);
    expect(arquivadas.body.data).toHaveLength(1);
    expect(arquivadas.body.data[0].status).toBe('archived');
    expect(arquivadas.body.data[0].archivedAt).not.toBeNull();
  });
});

describe('tarefa por id', () => {
  it('adult atualiza; child nao', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');
    const child = await addMember(owner.token, owner.household.id, 'child');

    const criada = await createTask(owner.token, owner.household.id);

    const peloAdult = await request(app)
      .patch('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(adult.token))
      .send({ name: 'Limpar o banheiro social' });

    expect(peloAdult.status).toBe(200);
    expect(peloAdult.body.data.name).toBe('Limpar o banheiro social');

    const peloChild = await request(app)
      .patch('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(child.token))
      .send({ name: 'Nao deveria' });

    expect(peloChild.status).toBe(403);
    expect(peloChild.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('mudar a dificuldade re-deriva os pontos', async () => {
    const owner = await createOwner();
    const criada = await createTask(owner.token, owner.household.id, { difficulty: 'facil' });

    expect(criada.body.data.points).toBe(2);

    const response = await request(app)
      .patch('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(owner.token))
      .send({ difficulty: 'muito_dificil' });

    expect(response.body.data.points).toBe(8);
  });

  it('tarefa de outra casa -> 404 (nao 403: nao vazamos existencia)', async () => {
    const casaA = await createOwner({ name: 'Casa A' });
    const casaB = await createOwner({ name: 'Casa B' });

    const criada = await createTask(casaA.token, casaA.household.id);

    const response = await request(app)
      .get('/api/v1/tasks/' + criada.body.data.id)
      .set(bearer(casaB.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('id malformado -> 400 VALIDATION_ERROR', async () => {
    const owner = await createOwner();

    const response = await request(app)
      .get('/api/v1/tasks/nao-e-um-id')
      .set(bearer(owner.token));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('excluir definitivamente exige owner', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');

    const criada = await createTask(owner.token, owner.household.id);

    const peloAdult = await request(app)
      .delete('/api/v1/tasks/' + criada.body.data.id + '?hard=true')
      .set(bearer(adult.token));

    expect(peloAdult.status).toBe(403);
    expect(peloAdult.body.error.code).toBe('INSUFFICIENT_ROLE');

    const peloOwner = await request(app)
      .delete('/api/v1/tasks/' + criada.body.data.id + '?hard=true')
      .set(bearer(owner.token));

    expect(peloOwner.status).toBe(204);
  });
});
