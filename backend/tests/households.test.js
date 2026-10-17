// tests/households.test.js
// Fase 1 — casas, convites, membros e papeis.

const { app, request, bearer, registerAndLogin, createOwner, getInviteCode, addMember } =
  require('./helpers/auth');

describe('casas', () => {
  it('cria casa e torna o criador owner', async () => {
    const owner = await createOwner({ name: 'Casa dos Martins' });

    expect(owner.household.name).toBe('Casa dos Martins');
    expect(owner.household.timezone).toBe('America/Sao_Paulo');
    expect(owner.household.ratingWindowHours).toBe(72);
    expect(owner.household.horizonDays).toBe(30);
    expect(owner.household.ownerId).toBeDefined();

    const membros = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/members')
      .set(bearer(owner.token));

    expect(membros.body.data).toHaveLength(1);
    expect(membros.body.data[0]).toMatchObject({ role: 'owner' });
    expect(membros.body.data[0].user.username).toBe(owner.user.username);
  });

  it('nunca devolve o codigo de convite na serializacao da casa', async () => {
    const owner = await createOwner();

    expect(owner.household.inviteCode).toBeUndefined();

    const detalhe = await request(app)
      .get('/api/v1/households/' + owner.household.id)
      .set(bearer(owner.token));

    expect(detalhe.body.data.inviteCode).toBeUndefined();
    expect(JSON.stringify(detalhe.body)).not.toMatch(/inviteCode/);
  });

  it('lista apenas as casas das quais o usuario e membro', async () => {
    const ownerA = await createOwner({ name: 'Casa A' });
    const ownerB = await createOwner({ name: 'Casa B' });

    const listaA = await request(app).get('/api/v1/households').set(bearer(ownerA.token));
    const listaB = await request(app).get('/api/v1/households').set(bearer(ownerB.token));

    expect(listaA.body.data.map((h) => h.name)).toEqual(['Casa A']);
    expect(listaB.body.data.map((h) => h.name)).toEqual(['Casa B']);
  });

  it('owner atualiza a casa; child recebe 403 INSUFFICIENT_ROLE', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const peloOwner = await request(app)
      .patch('/api/v1/households/' + owner.household.id)
      .set(bearer(owner.token))
      .send({ name: 'Casa Renomeada' });

    expect(peloOwner.status).toBe(200);
    expect(peloOwner.body.data.name).toBe('Casa Renomeada');

    const peloChild = await request(app)
      .patch('/api/v1/households/' + owner.household.id)
      .set(bearer(child.token))
      .send({ name: 'Casa do Child' });

    expect(peloChild.status).toBe(403);
    expect(peloChild.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('exige ?confirm=true para remover a casa', async () => {
    const owner = await createOwner();

    const semConfirm = await request(app)
      .delete('/api/v1/households/' + owner.household.id)
      .set(bearer(owner.token));

    expect(semConfirm.status).toBe(400);
    expect(semConfirm.body.error.code).toBe('VALIDATION_ERROR');

    const comConfirm = await request(app)
      .delete('/api/v1/households/' + owner.household.id + '?confirm=true')
      .set(bearer(owner.token));

    expect(comConfirm.status).toBe(204);

    const depois = await request(app)
      .get('/api/v1/households/' + owner.household.id)
      .set(bearer(owner.token));

    expect(depois.status).toBe(404);
    expect(depois.body.error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  it('casa inexistente -> 404 HOUSEHOLD_NOT_FOUND', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/v1/households/000000000000000000000000')
      .set(bearer(token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  it('id de casa malformado -> 400 VALIDATION_ERROR', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/v1/households/nao-e-um-id')
      .set(bearer(token));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('convite', () => {
  it('owner e adult leem o codigo; child nao', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');
    const child = await addMember(owner.token, owner.household.id, 'child');

    const comoOwner = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/invite')
      .set(bearer(owner.token));
    const comoAdult = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/invite')
      .set(bearer(adult.token));
    const comoChild = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/invite')
      .set(bearer(child.token));

    expect(comoOwner.status).toBe(200);
    expect(comoAdult.status).toBe(200);
    expect(comoOwner.body.data.code).toHaveLength(8);
    expect(comoChild.status).toBe(403);
    expect(comoChild.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('rotacionar invalida o codigo anterior', async () => {
    const owner = await createOwner();
    const antigo = await getInviteCode(owner.token, owner.household.id);

    const rotacionado = await request(app)
      .post('/api/v1/households/' + owner.household.id + '/invite')
      .set(bearer(owner.token));

    expect(rotacionado.status).toBe(200);
    expect(rotacionado.body.data.code).not.toBe(antigo);

    const novoUsuario = await registerAndLogin();
    const comCodigoAntigo = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(novoUsuario.token))
      .send({ inviteCode: antigo });

    expect(comCodigoAntigo.status).toBe(403);
    expect(comCodigoAntigo.body.error.code).toBe('INVITE_CODE_INVALID');
  });

  it('apenas owner rotaciona', async () => {
    const owner = await createOwner();
    const adult = await addMember(owner.token, owner.household.id, 'adult');

    const response = await request(app)
      .post('/api/v1/households/' + owner.household.id + '/invite')
      .set(bearer(adult.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('codigo invalido -> 403 INVITE_CODE_INVALID', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(token))
      .send({ inviteCode: 'NAOEXISTE' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_CODE_INVALID');
  });

  it('entrar duas vezes -> 409 DUPLICATE_MEMBER', async () => {
    const owner = await createOwner();
    const code = await getInviteCode(owner.token, owner.household.id);
    const novo = await registerAndLogin();

    await request(app)
      .post('/api/v1/households/join')
      .set(bearer(novo.token))
      .send({ inviteCode: code })
      .expect(201);

    const segunda = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(novo.token))
      .send({ inviteCode: code });

    expect(segunda.status).toBe(409);
    expect(segunda.body.error.code).toBe('DUPLICATE_MEMBER');
  });

  it('nao permite entrar ja como owner', async () => {
    const owner = await createOwner();
    const code = await getInviteCode(owner.token, owner.household.id);
    const novo = await registerAndLogin();

    const response = await request(app)
      .post('/api/v1/households/join')
      .set(bearer(novo.token))
      .send({ inviteCode: code, role: 'owner' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('membros', () => {
  it('lista membros com o usuario populado no formato do contrato', async () => {
    const owner = await createOwner();
    await addMember(owner.token, owner.household.id, 'adult');

    const response = await request(app)
      .get('/api/v1/households/' + owner.household.id + '/members')
      .set(bearer(owner.token));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    const adulto = response.body.data.find((m) => m.role === 'adult');
    expect(adulto.user.id).toBeDefined();
    expect(adulto.user.name).toBeDefined();
    expect(adulto.user.username).toBeDefined();
    expect(adulto.user.email).toBeUndefined();
    expect(adulto.householdId).toBe(owner.household.id);
    expect(adulto.capabilities).toEqual({
      canAssign: true,
      canRate: true,
      canManageTasks: true,
      canManageMembers: false,
    });
  });

  it('child tem todas as capacidades desligadas', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    expect(child.membership.capabilities).toEqual({
      canAssign: false,
      canRate: false,
      canManageTasks: false,
      canManageMembers: false,
    });
  });

  it('owner promove child para adult', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ role: 'adult' });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('adult');
    expect(response.body.data.capabilities.canManageTasks).toBe(true);
  });

  it('capacidades podem sobrepor o padrao do papel', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ capabilities: { canRate: true } });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('child');
    expect(response.body.data.capabilities).toEqual({
      canAssign: false,
      canRate: true,
      canManageTasks: false,
      canManageMembers: false,
    });
  });

  it('sem tempo livre configurado, o campo vem null (e nao zero)', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    // null = nunca configurado. Zero seria "configurado sem tempo", que gera aviso.
    expect(child.membership.freeTime).toBeNull();
  });

  it('tempo livre fixo vale para todos os dias', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'fixo', fixedMinutes: 120 } });

    expect(response.status).toBe(200);
    expect(response.body.data.freeTime.mode).toBe('fixo');
    expect(response.body.data.freeTime.fixedMinutes).toBe(120);
  });

  it('tempo livre por dia guarda os sete dias, domingo primeiro', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    // Seg a sex 1h, sabado 4h, domingo nada -- o exemplo do pedido.
    const semana = [0, 60, 60, 60, 60, 60, 240];

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'por_dia', byWeekday: semana } });

    expect(response.status).toBe(200);
    expect(response.body.data.freeTime.mode).toBe('por_dia');
    expect(response.body.data.freeTime.byWeekday).toEqual(semana);
  });

  it('dia nao marcado no modo por dia vira zero', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'por_dia', byWeekday: [0, 60, 60, 60, 60, 60, 240] } });

    // Domingo foi marcado como zero explicitamente e continua zero.
    expect(response.body.data.freeTime.byWeekday[0]).toBe(0);
  });

  it('null limpa o tempo livre e volta ao estado nao configurado', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');
    const url = '/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id;

    await request(app)
      .patch(url)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'fixo', fixedMinutes: 120 } });

    const limpo = await request(app).patch(url).set(bearer(owner.token)).send({ freeTime: null });

    // Limpar tem que ser diferente de zerar: zerar geraria aviso de carga.
    expect(limpo.status).toBe(200);
    expect(limpo.body.data.freeTime).toBeNull();
  });

  it('tempo livre nao mexe no papel nem nas capacidades', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'fixo', fixedMinutes: 90 } });

    expect(response.body.data.role).toBe('child');
    expect(response.body.data.capabilities.canManageTasks).toBe(false);
  });

  it('modo por dia exige os sete dias -> 400', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'por_dia', byWeekday: [60, 60] } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita tempo livre negativo -> 400', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(owner.token))
      .send({ freeTime: { mode: 'fixo', fixedMinutes: -30 } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('child nao altera o tempo livre de ninguem', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(child.token))
      .send({ freeTime: { mode: 'fixo', fixedMinutes: 999 } });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('nao deixa a casa sem owner ao rebaixar o ultimo', async () => {
    const owner = await createOwner();

    const response = await request(app)
      .patch('/api/v1/households/' + owner.household.id + '/members/' + owner.household.ownerId)
      .set(bearer(owner.token))
      .send({ role: 'adult' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LAST_OWNER_CANNOT_LEAVE');
  });

  it('ultimo owner nao consegue sair da casa', async () => {
    const owner = await createOwner();

    const response = await request(app)
      .delete('/api/v1/households/' + owner.household.id + '/members/' + owner.household.ownerId)
      .set(bearer(owner.token));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LAST_OWNER_CANNOT_LEAVE');
  });

  it('membro comum sai da casa por conta propria', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .delete('/api/v1/households/' + owner.household.id + '/members/' + child.membership.user.id)
      .set(bearer(child.token));

    expect(response.status).toBe(204);

    const depois = await request(app)
      .get('/api/v1/households/' + owner.household.id)
      .set(bearer(child.token));

    expect(depois.status).toBe(403);
    expect(depois.body.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
  });

  it('child nao remove outro membro', async () => {
    const owner = await createOwner();
    const child = await addMember(owner.token, owner.household.id, 'child');
    const outroChild = await addMember(owner.token, owner.household.id, 'child');

    const response = await request(app)
      .delete(
        '/api/v1/households/' +
          owner.household.id +
          '/members/' +
          outroChild.membership.user.id
      )
      .set(bearer(child.token));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('membro inexistente -> 404 MEMBER_NOT_FOUND', async () => {
    const owner = await createOwner();

    const response = await request(app)
      .delete('/api/v1/households/' + owner.household.id + '/members/000000000000000000000000')
      .set(bearer(owner.token));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MEMBER_NOT_FOUND');
  });
});
