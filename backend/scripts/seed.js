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
const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');
const { runDailyJob } = require('../services/occurrences');
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
function tasksFor(today) {
  return [
    {
      name: 'Limpar banheiro',
      difficulty: 'dificil',
      assignedTo: 'isabella',
      recurrence: { frequency: 'semanal', weekdays: [6], startDate: today },
    },
    {
      name: 'Lavar louca',
      difficulty: 'facil',
      assignedTo: 'arthur',
      recurrence: { frequency: 'diaria', startDate: today },
    },
    {
      name: 'Tirar o lixo',
      difficulty: 'facil',
      assignedTo: null,
      recurrence: { frequency: 'diaria', startDate: today },
    },
    {
      name: 'Passar aspirador',
      difficulty: 'medio',
      assignedTo: 'gabryel',
      recurrence: { frequency: 'semanal', interval: 2, weekdays: [3, 6], startDate: today },
    },
    {
      // Sem responsavel fixo: a cada ocorrencia o rodizio escolhe um membro.
      name: 'Trocar roupa de cama',
      difficulty: 'medio',
      assignedTo: null,
      assignmentStrategy: 'rotate',
      recurrence: { frequency: 'semanal', weekdays: [0], startDate: today },
    },
    {
      // Tarefa pontual: uma ocorrencia so.
      name: 'Limpar a caixa de agua',
      difficulty: 'muito_dificil',
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
    TaskExecutionHistory.deleteMany(),
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
        assignedTo: data.assignedTo ? usersByUsername[data.assignedTo]._id : null,
        assignmentStrategy: data.assignmentStrategy,
        recurrence: data.recurrence,
      })
    );
  }

  // Materializa a agenda (mesmo gerador que o job diario usa).
  const summary = await runDailyJob();
  console.log('Agenda gerada: ' + summary.created + ' ocorrencias.');

  // Duas execucoes: uma ja conferida e outra aguardando avaliacao.
  const banheiro = tasks.find((task) => task.name === 'Limpar banheiro');
  const louca = tasks.find((task) => task.name === 'Lavar louca');

  const ocorrenciaBanheiro = await TaskOccurrence.findOne({ task: banheiro._id }).sort({
    dueDate: 1,
  });

  await TaskExecutionHistory.create({
    household: household._id,
    task: banheiro._id,
    executedBy: usersByUsername.isabella._id,
    note: 'Banheiro limpo e brilhando!',
    rating: 5,
    ratingNote: 'Ficou otimo, obrigada!',
  });

  await TaskOccurrence.updateOne(
    { _id: ocorrenciaBanheiro._id },
    {
      $set: {
        status: 'done',
        completedAt: new Date(),
        completedBy: usersByUsername.isabella._id,
      },
    }
  );

  const ocorrenciaLouca = await TaskOccurrence.findOne({ task: louca._id }).sort({ dueDate: 1 });

  await TaskExecutionHistory.create({
    household: household._id,
    task: louca._id,
    executedBy: usersByUsername.arthur._id,
    note: 'Louca lavada e guardada.',
  });

  await TaskOccurrence.updateOne(
    { _id: ocorrenciaLouca._id },
    {
      $set: {
        status: 'done',
        completedAt: new Date(),
        completedBy: usersByUsername.arthur._id,
      },
    }
  );

  const pendentes = await TaskOccurrence.countDocuments({ status: 'pending' });

  console.log('');
  console.log('Casa:              ' + household.name);
  console.log('Codigo de convite: ' + household.inviteCode);
  console.log('Senha de todos:    ' + PASSWORD);
  console.log('Ocorrencias pendentes na agenda: ' + pendentes);
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
