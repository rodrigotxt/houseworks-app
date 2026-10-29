// tests/reminders.test.js
// Lembretes: recorrencia, destinatarios, canais, disparo, "feito", adiar e push.
//
// Os testes de disparo NAO esperam o relogio: materializam o disparo e chamam
// dispatchDue() com um "agora" injetado, como o resto da suite faz com as ocorrencias.

const mongoose = require('mongoose');

const { app, request, bearer, createOwner, addMember } = require('./helpers/auth');
const { createTask, firstOccurrence, completeOccurrence } = require('./helpers/fixtures');
const { todayInZone, addDays } = require('../services/time');
const reminders = require('../services/reminders');
const Household = require('../models/Household');
const Reminder = require('../models/Reminder');
const ReminderFiring = require('../models/ReminderFiring');
const ReminderDelivery = require('../models/ReminderDelivery');
const PushSubscription = require('../models/PushSubscription');

const TZ = 'America/Sao_Paulo';

function hoje() {
  return todayInZone(TZ);
}

function schedule(overrides) {
  return Object.assign(
    { frequency: 'diaria', startDate: hoje(), time: '21:00' },
    overrides || {}
  );
}

function criar(token, householdId, body) {
  return request(app)
    .post('/api/v1/households/' + householdId + '/reminders')
    .set(bearer(token))
    .send(body);
}

function listar(token, householdId, query) {
  return request(app)
    .get('/api/v1/households/' + householdId + '/reminders')
    .query(query || {})
    .set(bearer(token));
}

// Cria um disparo "vencido" e despacha. Devolve o disparo relido e o resumo.
async function dispararAgora(reminderId, options) {
  const settings = options || {};
  const reminder = await Reminder.findById(reminderId);
  const fireAt = settings.fireAt || new Date(Date.now() - 1000);

  const firing = await ReminderFiring.create({
    reminder: reminder._id,
    household: reminder.household,
    fireAt,
    localDate: hoje(),
    localTime: '21:00',
    kind: settings.kind || 'schedule',
    user: settings.user || null,
    status: 'scheduled',
  });

  const summary = await reminders.dispatchDue({ now: settings.now || new Date() });

  return {
    firing: await ReminderFiring.findById(firing._id),
    summary,
  };
}

async function cenario() {
  const owner = await createOwner();
  const adult = await addMember(owner.token, owner.household.id, 'adult');
  const child = await addMember(owner.token, owner.household.id, 'child');

  return { owner, adult, child };
}

describe('criacao de lembrete', () => {
  it('adulto cria para outra pessoa e o proximo disparo ja nasce materializado', async () => {
    const { owner, adult, child } = await cenario();

    const response = await criar(adult.token, owner.household.id, {
      title: 'Tomar o remedio',
      notes: 'Depois do jantar',
      schedule: schedule({ time: '21:00' }),
      recipients: [child.membership.user.id],
    });

    expect(response.status).toBe(201);

    const lembrete = response.body.data;
    expect(lembrete.title).toBe('Tomar o remedio');
    expect(lembrete.recipients).toHaveLength(1);
    expect(lembrete.recipients[0].id).toBe(child.membership.user.id);
    expect(lembrete.allMembers).toBe(false);
    expect(lembrete.channels).toEqual(['in_app']);
    expect(lembrete.nextFireAt).toBeTruthy();

    const disparos = await ReminderFiring.countDocuments({ reminder: lembrete.id });
    expect(disparos).toBeGreaterThan(0);
  });

  it('crianca cria para si mesma, sem poder escolher outro destinatario', async () => {
    const { owner, child } = await cenario();

    const proprio = await criar(child.token, owner.household.id, {
      title: 'Guardar o material',
      schedule: schedule({ time: '18:00' }),
    });

    expect(proprio.status).toBe(201);
    expect(proprio.body.data.recipients).toHaveLength(1);
    expect(proprio.body.data.recipients[0].id).toBe(child.membership.user.id);

    const paraOutro = await criar(child.token, owner.household.id, {
      title: 'Avisar o pai',
      schedule: schedule(),
      recipients: [owner.household.ownerId || owner.user.id],
    });

    expect(paraOutro.status).toBe(403);
    expect(paraOutro.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('"todos" vira allMembers, e a crianca nao pode usar', async () => {
    const { owner, adult, child } = await cenario();

    const todos = await criar(adult.token, owner.household.id, {
      title: 'Conferir a maquina',
      schedule: schedule(),
      allMembers: true,
    });

    expect(todos.status).toBe(201);
    expect(todos.body.data.allMembers).toBe(true);
    expect(todos.body.data.recipients).toEqual([]);

    const tentativa = await criar(child.token, owner.household.id, {
      title: 'Avisar todo mundo',
      schedule: schedule(),
      allMembers: true,
    });

    expect(tentativa.status).toBe(403);
  });

  it('recusa destinatario que nao e membro da casa', async () => {
    const { owner, adult } = await cenario();
    const outraCasa = await createOwner();

    const response = await criar(adult.token, owner.household.id, {
      title: 'Aviso para estranho',
      schedule: schedule(),
      recipients: [outraCasa.household.ownerId],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('recipients');
  });

  it('recusa canal que nao existe nesta instalacao', async () => {
    const { owner, adult } = await cenario();

    const response = await criar(adult.token, owner.household.id, {
      title: 'Aviso por e-mail',
      schedule: schedule(),
      channels: ['email'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CHANNEL_NOT_AVAILABLE');
  });

  it('recusa semanal sem dia da semana', async () => {
    const { owner, adult } = await cenario();

    const response = await criar(adult.token, owner.household.id, {
      title: 'Sem dia',
      schedule: schedule({ frequency: 'semanal' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('crianca so ve os lembretes que criou ou recebe', async () => {
    const { owner, adult, child } = await cenario();
    const outra = await addMember(owner.token, owner.household.id, 'child');

    await criar(adult.token, owner.household.id, {
      title: 'Remedio do filho',
      schedule: schedule(),
      recipients: [child.membership.user.id],
    });

    const doOutro = await listar(outra.token, owner.household.id);

    expect(doOutro.status).toBe(200);
    expect(doOutro.body.data).toHaveLength(0);

    const doProprio = await listar(child.token, owner.household.id);
    expect(doProprio.body.data).toHaveLength(1);

    const doAdulto = await listar(adult.token, owner.household.id);
    expect(doAdulto.body.data).toHaveLength(1);
  });
});

describe('recorrencia e fuso', () => {
  it('converte a hora local da casa no instante UTC certo', async () => {
    const { owner, adult } = await cenario();

    // Lembrete diario as 21:00 em America/Sao_Paulo (UTC-3). Em 10/07/2025 isso e
    // 2025-07-11T00:00:00Z — o dia seguinte em UTC, e o mesmo dia na casa. E
    // exatamente o tipo de erro que a string YYYY-MM-DD + fuso evita.
    const criado = await criar(adult.token, owner.household.id, {
      title: 'Remedio as nove',
      schedule: schedule({ frequency: 'diaria', startDate: '2025-07-10', time: '21:00' }),
    });

    const reminder = await Reminder.findById(criado.body.data.id);

    // Recua a criacao e o marcador para simular um lembrete que ja existia.
    // Pelo driver (e nao por save): createdAt e imutavel no Mongoose.
    await Reminder.collection.updateOne(
      { _id: reminder._id },
      { $set: { createdAt: new Date('2025-07-10T10:00:00Z'), firingsGeneratedUntil: null } }
    );
    await ReminderFiring.deleteMany({ reminder: reminder._id });

    const household = await Household.findById(owner.household.id);
    await reminders.refreshHousehold(household, {
      now: new Date('2025-07-10T20:00:00Z'), // 17:00 na casa
    });

    const disparo = await ReminderFiring.findOne({
      reminder: reminder._id,
      localDate: '2025-07-10',
    });

    expect(disparo).toBeTruthy();
    expect(disparo.fireAt.toISOString()).toBe('2025-07-11T00:00:00.000Z');
    expect(disparo.localTime).toBe('21:00');
  });

  it('nao dispara no passado nem quando a hora de hoje ja passou na criacao', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Remedio da noite',
      schedule: schedule({ frequency: 'diaria', startDate: '2025-07-10', time: '21:00' }),
    });

    const reminder = await Reminder.findById(criado.body.data.id);
    // 22:00 na casa (BRT), depois da hora do lembrete (21:00): hoje nao dispara.
    await Reminder.collection.updateOne(
      { _id: reminder._id },
      { $set: { createdAt: new Date('2025-07-11T01:00:00Z'), firingsGeneratedUntil: null } }
    );
    await ReminderFiring.deleteMany({ reminder: reminder._id });

    const household = await Household.findById(owner.household.id);

    await reminders.refreshHousehold(household, {
      now: new Date('2025-07-11T01:00:00Z'),
    });

    const doDia = await ReminderFiring.countDocuments({
      reminder: reminder._id,
      localDate: '2025-07-10',
    });

    expect(doDia).toBe(0);

    // Mas os dias seguintes existem normalmente.
    expect(
      await ReminderFiring.countDocuments({ reminder: reminder._id })
    ).toBeGreaterThan(0);
  });
});

describe('disparo', () => {
  it('entrega para cada destinatario e cria a notificacao no in_app', async () => {
    const { owner, adult, child } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Lavar a roupa',
      notes: 'A maquina esta livre',
      schedule: schedule(),
      recipients: [adult.membership.user.id, child.membership.user.id],
    });

    const { firing } = await dispararAgora(criado.body.data.id);

    expect(firing.status).toBe('delivered');

    const entregas = await ReminderDelivery.find({ reminder: criado.body.data.id });
    expect(entregas).toHaveLength(2);
    expect(entregas.every((entrega) => entrega.channels[0].channel === 'in_app')).toBe(true);
    expect(entregas.every((entrega) => entrega.channels[0].status === 'sent')).toBe(true);
  });

  it('lembrete vinculado a tarefa ja concluida nao incomoda', async () => {
    const { owner, adult, child } = await cenario();

    const tarefa = await createTask(adult.token, owner.household.id, {
      recurrence: { frequency: 'diaria', startDate: hoje() },
    });
    const ocorrencia = await firstOccurrence(owner.household.id, tarefa.body.data.id);

    const conclusao = await completeOccurrence(child.token, ocorrencia.id, {});
    expect(conclusao.status).toBe(201);

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Conferir se lavou a louca',
      schedule: schedule(),
      recipients: [child.membership.user.id],
      task: tarefa.body.data.id,
    });

    expect(criado.status).toBe(201);

    const { firing } = await dispararAgora(criado.body.data.id);

    expect(firing.status).toBe('skipped');
    expect(firing.reason).toBe('tarefa_concluida');
    expect(await ReminderDelivery.countDocuments({ reminder: criado.body.data.id })).toBe(0);
  });

  it('"todos" resolve os membros no momento do disparo', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Reuniao da casa',
      schedule: schedule(),
      allMembers: true,
    });

    const entrouDepois = await addMember(owner.token, owner.household.id, 'child');

    const { firing } = await dispararAgora(criado.body.data.id);
    expect(firing.status).toBe('delivered');

    // owner + adult + child do cenario + child que entrou depois: o "todos" e dinamico.
    const entregas = await ReminderDelivery.find({ reminder: criado.body.data.id });
    expect(entregas).toHaveLength(4);
    expect(
      entregas.some((entrega) => String(entrega.user) === entrouDepois.membership.user.id)
    ).toBe(true);
  });

  it('disparo unico (ocasional) sai do ar depois de tocar', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Tirar o lixo hoje',
      schedule: schedule({ frequency: 'ocasional', startDate: hoje() }),
    });

    await dispararAgora(criado.body.data.id);

    const relido = await Reminder.findById(criado.body.data.id);
    expect(relido.status).toBe('archived');

    const ativos = await listar(adult.token, owner.household.id);
    expect(ativos.body.data).toHaveLength(0);
  });

  it('disparo atrasado demais vira "missed" em vez de chegar fora de hora', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Remedio da manha',
      schedule: schedule({ time: '08:00' }),
    });

    const reminder = await Reminder.findById(criado.body.data.id);
    const antigo = await ReminderFiring.create({
      reminder: reminder._id,
      household: reminder.household,
      fireAt: new Date(Date.now() - 60 * 60 * 1000),
      localDate: hoje(),
      localTime: '08:00',
      status: 'scheduled',
    });

    await reminders.dispatchDue({ now: new Date() });

    const relido = await ReminderFiring.findById(antigo._id);
    expect(relido.status).toBe('missed');
    expect(relido.reason).toBe('janela_expirada');
    expect(await ReminderDelivery.countDocuments({ reminder: reminder._id })).toBe(0);
  });
});

describe('feito e adiado', () => {
  it('o destinatario marca como feito; quem nao recebeu nao pode', async () => {
    const { owner, adult, child } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Escovar os dentes',
      schedule: schedule(),
      recipients: [child.membership.user.id],
    });

    await dispararAgora(criado.body.data.id);

    const feito = await request(app)
      .post('/api/v1/reminders/' + criado.body.data.id + '/ack')
      .set(bearer(child.token));

    expect(feito.status).toBe(200);
    expect(feito.body.data.acknowledgedAt).toBeTruthy();
    expect(feito.body.data.readAt).toBeTruthy();

    const alheio = await request(app)
      .post('/api/v1/reminders/' + criado.body.data.id + '/ack')
      .set(bearer(owner.token));

    expect(alheio.status).toBe(403);
    expect(alheio.body.error.code).toBe('REMINDER_NOT_ASSIGNED_TO_YOU');
  });

  it('adiar cria um disparo so para quem pediu', async () => {
    const { owner, adult, child } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Regar as plantas',
      schedule: schedule(),
      recipients: [adult.membership.user.id, child.membership.user.id],
    });

    await dispararAgora(criado.body.data.id);

    const response = await request(app)
      .post('/api/v1/reminders/' + criado.body.data.id + '/snooze')
      .set(bearer(child.token))
      .send({ minutes: 30 });

    expect(response.status).toBe(201);
    expect(response.body.data.kind).toBe('snooze');
    expect(response.body.data.reminderId).toBe(criado.body.data.id);

    const relido = await ReminderFiring.findOne({
      _id: response.body.data.id,
    });

    expect(relido.fireAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);

    const resumo = await reminders.dispatchDue({
      now: new Date(Date.now() + 31 * 60 * 1000),
    });

    expect(resumo.delivered).toBe(1);

    const entregasDoAdiado = await ReminderDelivery.find({
      firing: relido._id,
    });

    expect(entregasDoAdiado).toHaveLength(1);
    expect(String(entregasDoAdiado[0].user)).toBe(child.membership.user.id);
  });
});

describe('edicao e arquivamento', () => {
  it('crianca edita o proprio lembrete e nao o dos outros', async () => {
    const { owner, adult, child } = await cenario();

    const doAdulto = await criar(adult.token, owner.household.id, {
      title: 'Lembrete do adulto',
      schedule: schedule(),
    });

    const tentativa = await request(app)
      .patch('/api/v1/reminders/' + doAdulto.body.data.id)
      .set(bearer(child.token))
      .send({ title: 'Tentando mudar' });

    expect(tentativa.status).toBe(403);

    const proprio = await criar(child.token, owner.household.id, {
      title: 'Meu lembrete',
      schedule: schedule(),
    });

    const edicao = await request(app)
      .patch('/api/v1/reminders/' + proprio.body.data.id)
      .set(bearer(child.token))
      .send({ title: 'Meu lembrete editado' });

    expect(edicao.status).toBe(200);
    expect(edicao.body.data.title).toBe('Meu lembrete editado');
  });

  it('pausar cancela os disparos futuros; reativar recalcula', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Remedio da noite',
      schedule: schedule({ time: '21:00' }),
    });

    const pausado = await request(app)
      .patch('/api/v1/reminders/' + criado.body.data.id)
      .set(bearer(adult.token))
      .send({ status: 'paused' });

    expect(pausado.status).toBe(200);
    expect(pausado.body.data.nextFireAt).toBeNull();
    expect(
      await ReminderFiring.countDocuments({
        reminder: criado.body.data.id,
        status: 'scheduled',
      })
    ).toBe(0);

    const ativado = await request(app)
      .patch('/api/v1/reminders/' + criado.body.data.id)
      .set(bearer(adult.token))
      .send({ status: 'active' });

    expect(ativado.status).toBe(200);
    expect(ativado.body.data.nextFireAt).toBeTruthy();
  });

  it('arquivar esconde da lista; ?hard=true apaga tudo e so o owner pode', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Lembrete descartavel',
      schedule: schedule(),
    });

    const arquivado = await request(app)
      .delete('/api/v1/reminders/' + criado.body.data.id)
      .set(bearer(adult.token));

    expect(arquivado.status).toBe(204);

    const lista = await listar(adult.token, owner.household.id);
    expect(lista.body.data).toHaveLength(0);

    const todos = await listar(adult.token, owner.household.id, { status: 'all' });
    expect(todos.body.data).toHaveLength(1);

    const recusa = await request(app)
      .delete('/api/v1/reminders/' + criado.body.data.id)
      .query({ hard: 'true' })
      .set(bearer(adult.token));

    expect(recusa.status).toBe(403);

    const exclusao = await request(app)
      .delete('/api/v1/reminders/' + criado.body.data.id)
      .query({ hard: 'true' })
      .set(bearer(owner.token));

    expect(exclusao.status).toBe(204);
    expect(await Reminder.findById(criado.body.data.id)).toBeNull();
  });
});

describe('notificacoes', () => {
  it('a caixa mostra so o que e meu, e a leitura e registrada', async () => {
    const { owner, adult, child } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Beber agua',
      schedule: schedule(),
      recipients: [child.membership.user.id],
    });

    await dispararAgora(criado.body.data.id);

    const doFilho = await request(app)
      .get('/api/v1/me/notifications')
      .set(bearer(child.token));

    expect(doFilho.status).toBe(200);
    expect(doFilho.body.data).toHaveLength(1);
    expect(doFilho.body.data[0].reminder.title).toBe('Beber agua');
    expect(doFilho.body.data[0].readAt).toBeNull();

    const doOwner = await request(app)
      .get('/api/v1/me/notifications')
      .set(bearer(owner.token));

    expect(doOwner.body.data).toHaveLength(0);

    const leitura = await request(app)
      .post('/api/v1/me/notifications/' + doFilho.body.data[0].id + '/read')
      .set(bearer(child.token));

    expect(leitura.status).toBe(200);
    expect(leitura.body.data.readAt).toBeTruthy();

    const naoLidas = await request(app)
      .get('/api/v1/me/notifications')
      .query({ unread: 'true' })
      .set(bearer(child.token));

    expect(naoLidas.body.data).toHaveLength(0);
  });
});

describe('push', () => {
  it('expoe a chave publica e aceita inscrever e remover o aparelho', async () => {
    const { child } = await cenario();

    const config = await request(app)
      .get('/api/v1/me/push/config')
      .set(bearer(child.token));

    expect(config.status).toBe(200);
    expect(config.body.data.enabled).toBe(true);
    expect(config.body.data.publicKey).toBeTruthy();

    const inscricao = await request(app)
      .post('/api/v1/me/push/subscriptions')
      .set(bearer(child.token))
      .send({
        endpoint: 'https://push.example.com/aparelho/1',
        keys: { p256dh: 'chave-publica', auth: 'segredo' },
        userAgent: 'Teste/1.0',
      });

    expect(inscricao.status).toBe(201);
    expect(inscricao.body.data.endpoint).toBe('https://push.example.com/aparelho/1');
    expect(inscricao.body.data.keys).toBeUndefined();

    const lista = await request(app)
      .get('/api/v1/me/push/subscriptions')
      .set(bearer(child.token));

    expect(lista.body.data).toHaveLength(1);

    const remocao = await request(app)
      .delete('/api/v1/me/push/subscriptions')
      .set(bearer(child.token))
      .send({ endpoint: 'https://push.example.com/aparelho/1' });

    expect(remocao.status).toBe(204);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  it('sem aparelho inscrito, o canal push e pulado e o in_app continua', async () => {
    const { owner, adult } = await cenario();

    const criado = await criar(adult.token, owner.household.id, {
      title: 'Aviso com push',
      schedule: schedule(),
      channels: ['in_app', 'push'],
    });

    await dispararAgora(criado.body.data.id);

    const entrega = await ReminderDelivery.findOne({ reminder: criado.body.data.id });
    const pushResult = entrega.channels.find((canal) => canal.channel === 'push');
    const inAppResult = entrega.channels.find((canal) => canal.channel === 'in_app');

    expect(inAppResult.status).toBe('sent');
    expect(pushResult.status).toBe('skipped');
    expect(pushResult.reason).toBe('sem_inscricao');
  });
});
