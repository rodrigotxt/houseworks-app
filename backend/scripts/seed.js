// scripts/seed.js
// Popula uma familia de exemplo: usuarios, casa, memberships, tarefas e AGENDA.
//
// Nao existe base real a migrar — este script E o estado inicial do projeto.
// Use "npm run seed" e "npm run seed:destroy".

const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('../models/User');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const TaskOccurrence = require('../models/TaskOccurrence');
const TaskExecution = require('../models/TaskExecution');
const Reminder = require('../models/Reminder');
const ReminderFiring = require('../models/ReminderFiring');
const ReminderDelivery = require('../models/ReminderDelivery');
const PushSubscription = require('../models/PushSubscription');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');
const { runDailyJob } = require('../services/occurrences');
const { refreshHousehold } = require('../services/reminders');
const { todayInZone } = require('../services/time');

dotenv.config();

const PASSWORD = 'a1b2c3d4'; // 8 caracteres: e o minimo aceito pelo contrato.
const TIMEZONE = 'America/Sao_Paulo';

const FAMILY = [
  { name: 'Rodrigo Martins', username: 'rodrigo', email: 'contato@rodrigo.inf.br', role: 'owner' },
  { name: 'Geissiane Franca Soares', username: 'geissiane', email: 'contato@geissiane.com.br', role: 'adult' },
  { name: 'Arthur Soares Martins', username: 'arthur', email: 'arthur@rodrigo.inf.br', role: 'child' },
  { name: 'Isabella Soares Martins', username: 'isabella', email: 'isabella@rodrigo.inf.br', role: 'child' },
  { name: 'Luis C. Gabryel Martins', username: 'gabryel', email: 'gabryel@rodrigo.inf.br', role: 'child' },
];

// A recorrencia comeca hoje: a agenda olha para a frente, nao para tras.
// Domingo primeiro. Os adultos tem mais folga no fim de semana; as criancas, o mesmo
// todos os dias.
const TEMPO_LIVRE = {
  rodrigo: { mode: 'por_dia', byWeekday: [180, 120, 120, 120, 120, 120, 240] },
  geissiane: { mode: 'por_dia', byWeekday: [180, 120, 120, 120, 120, 120, 240] },
  arthur: { mode: 'fixo', fixedMinutes: 90 },
  isabella: { mode: 'fixo', fixedMinutes: 90 },
  gabryel: { mode: 'fixo', fixedMinutes: 90 },
};

function tasksFor(today) {
  return [
    {
      name: 'Limpar banheiro',
      difficulty: 'dificil',
      estimatedMinutes: 45,
      assignedTo: 'isabella',
      recurrence: { frequency: 'semanal', weekdays: [6], startDate: today },
    },
    {
      name: 'Lavar louca',
      difficulty: 'facil',
      estimatedMinutes: 15,
      assignedTo: 'arthur',
      recurrence: { frequency: 'diaria', startDate: today },
    },
    {
      name: 'Tirar o lixo',
      difficulty: 'facil',
      estimatedMinutes: 5,
      assignedTo: null,
      recurrence: { frequency: 'diaria', startDate: today },
    },
    {
      name: 'Passar aspirador',
      difficulty: 'medio',
      estimatedMinutes: 30,
      assignedTo: 'gabryel',
      recurrence: { frequency: 'semanal', interval: 2, weekdays: [3, 6], startDate: today },
    },
    {
      // Sem responsavel fixo: a cada ocorrencia o rodizio escolhe um membro.
      name: 'Trocar roupa de cama',
      difficulty: 'medio',
      estimatedMinutes: 20,
      assignedTo: null,
      assignmentStrategy: 'rotate',
      recurrence: { frequency: 'semanal', weekdays: [0], startDate: today },
    },
    {
      // Tarefa pontual: uma ocorrencia so.
      name: 'Limpar a caixa de agua',
      difficulty: 'muito_dificil',
      estimatedMinutes: 90,
      assignedTo: null,
      recurrence: { frequency: 'ocasional', startDate: today },
    },
  ];
}

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB conectado para seeding em ' + mongoose.connection.name);
}

async function clearAll() {
  await Promise.all([
    User.deleteMany(),
    Household.deleteMany(),
    Membership.deleteMany(),
    Task.deleteMany(),
    TaskOccurrence.deleteMany(),
    TaskExecution.deleteMany(),
    Reminder.deleteMany(),
    ReminderFiring.deleteMany(),
    ReminderDelivery.deleteMany(),
    PushSubscription.deleteMany(),
  ]);
}

async function importData() {
  await connectDB();

  console.log('Limpando colecoes...');
  await clearAll();

  // User.create dispara o pre-save que criptografa a senha (insertMany nao dispara).
  const usersByUsername = {};
  for (const member of FAMILY) {
    usersByUsername[member.username] = await User.create({
      name: member.name,
      username: member.username,
      email: member.email,
      password: PASSWORD,
    });
  }

  const household = await Household.create({
    name: 'Casa dos Martins',
    timezone: TIMEZONE,
    ownerId: usersByUsername.rodrigo._id,
    inviteCode: generateInviteCode(),
    inviteCodeExpiresAt: inviteExpiry(),
  });

  for (const member of FAMILY) {
    await Membership.create({
      user: usersByUsername[member.username]._id,
      household: household._id,
      role: member.role,
      // Tempo livre para as tarefas. Folgado de proposito: o seed existe para mostrar a
      // casa funcionando, e um aviso de carga em todo dia nao ensinaria nada.
      freeTime: TEMPO_LIVRE[member.username],
    });
  }

  const today = todayInZone(TIMEZONE);

  const tasks = [];
  for (const data of tasksFor(today)) {
    tasks.push(
      await Task.create({
        household: household._id,
        createdBy: usersByUsername.rodrigo._id,
        name: data.name,
        difficulty: data.difficulty,
        estimatedMinutes: data.estimatedMinutes,
        assignedTo: data.assignedTo ? usersByUsername[data.assignedTo]._id : null,
        assignmentStrategy: data.assignmentStrategy,
        recurrence: data.recurrence,
      })
    );
  }

  // Materializa a agenda (mesmo gerador que o job diario usa).
  const summary = await runDailyJob();
  console.log('Agenda gerada: ' + summary.created + ' ocorrencias.');

  // Duas execucoes: uma ja conferida por outro membro e outra aguardando avaliacao.
  // Gravadas no modelo (e nao pela API) porque o seed monta Estado, nao fluxo — o
  // caminho real (POST /occurrences/:id/complete) e coberto pelos testes.
  async function concluir(nomeDaTarefa, executor, campos) {
    const task = tasks.find((item) => item.name === nomeDaTarefa);
    const occurrence = await TaskOccurrence.findOne({ task: task._id }).sort({ dueDate: 1 });

    occurrence.status = 'done';
    occurrence.completedAt = new Date();
    occurrence.completedBy = usersByUsername[executor]._id;
    await occurrence.save();

    return TaskExecution.create(
      Object.assign(
        {
          household: household._id,
          occurrence: occurrence._id,
          task: task._id,
          dueDate: occurrence.dueDate,
          executedBy: usersByUsername[executor]._id,
          points: occurrence.points,
        },
        campos
      )
    );
  }

  await concluir('Limpar banheiro', 'isabella', {
    note: 'Banheiro limpo e brilhando!',
    status: 'approved',
    rating: 5,
    ratingNote: 'Ficou otimo, obrigada!',
    ratedBy: usersByUsername.rodrigo._id,
    ratedAt: new Date(),
  });

  await concluir('Lavar louca', 'arthur', {
    note: 'Louca lavada e guardada.',
    status: 'pending_review',
  });

  // Lembretes de exemplo: os tres casos que motivaram a funcionalidade.
  await Reminder.create({
    household: household._id,
    title: 'Tomar o remedio',
    notes: 'Depois do jantar, com um copo de agua.',
    createdBy: usersByUsername.geissiane._id,
    schedule: {
      frequency: 'diaria',
      startDate: today,
      time: '21:00',
    },
    recipients: [usersByUsername.arthur._id],
    channels: ['in_app'],
  });

  await Reminder.create({
    household: household._id,
    title: 'Conferir a roupa suja',
    notes: 'A maquina ja pode lavar?',
    createdBy: usersByUsername.rodrigo._id,
    schedule: {
      frequency: 'semanal',
      weekdays: [1, 4],
      startDate: today,
      time: '08:00',
    },
    allMembers: true,
    channels: ['in_app'],
  });

  const tarefaDaLouca = tasks.find((item) => item.name === 'Lavar louca');

  await Reminder.create({
    household: household._id,
    title: 'A louca foi lavada?',
    notes: 'So avisa se ainda nao foi.',
    createdBy: usersByUsername.rodrigo._id,
    schedule: {
      frequency: 'diaria',
      startDate: today,
      time: '20:00',
    },
    recipients: [usersByUsername.geissiane._id],
    task: tarefaDaLouca._id,
    skipIfTaskDone: true,
    channels: ['in_app'],
  });

  // Materializa os proximos disparos (mesmo gerador do job de cada minuto).
  const disparos = await refreshHousehold(household);

  const pendentes = await TaskOccurrence.countDocuments({ status: 'pending' });
  const aguardandoAvaliacao = await TaskExecution.countDocuments({ status: 'pending_review' });

  console.log('');
  console.log('Casa:              ' + household.name);
  console.log('Codigo de convite: ' + household.inviteCode);
  console.log('Senha de todos:    ' + PASSWORD);
  console.log('Ocorrencias pendentes na agenda: ' + pendentes);
  console.log('Execucoes aguardando avaliacao:   ' + aguardandoAvaliacao);
  console.log('Lembretes de exemplo:             3 (' + disparos + ' disparos materializados)');
  console.log('Usuarios:');
  FAMILY.forEach((member) => {
    console.log('  ' + member.role.padEnd(6) + member.username);
  });
}

async function destroyData() {
  await connectDB();
  console.log('Deletando todos os dados...');
  await clearAll();
  console.log('Todos os dados deletados com sucesso!');
}

async function run() {
  const destroy = process.argv[2] === '-d' || process.argv[2] === '--destroy';

  try {
    if (destroy) {
      await destroyData();
    } else {
      await importData();
      console.log('');
      console.log('Dados importados com sucesso!');
    }
  } catch (error) {
    console.error('Erro no seeding: ' + error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
