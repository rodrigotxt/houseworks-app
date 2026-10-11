// scripts/seed.js
// Popula uma familia de exemplo: usuarios, casa, memberships, tarefas e execucoes.
//
// Nao existe base real a migrar — este script E o estado inicial do projeto.
// Use "npm run seed" e "npm run seed:destroy".

const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('../models/User');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const TaskExecutionHistory = require('../models/TaskExecutionHistory');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');

dotenv.config();

const PASSWORD = 'a1b2c3d4'; // 8 caracteres: e o minimo aceito pelo contrato.

const FAMILY = [
  { name: 'Rodrigo Martins', username: 'rodrigo', email: 'contato@rodrigo.inf.br', role: 'owner' },
  { name: 'Geissiane Franca Soares', username: 'geissiane', email: 'contato@geissiane.com.br', role: 'adult' },
  { name: 'Arthur Soares Martins', username: 'arthur', email: 'arthur@rodrigo.inf.br', role: 'child' },
  { name: 'Isabella Soares Martins', username: 'isabella', email: 'isabella@rodrigo.inf.br', role: 'child' },
  { name: 'Luis C. Gabryel Martins', username: 'gabryel', email: 'gabryel@rodrigo.inf.br', role: 'child' },
];

const TASKS = [
  { name: 'Limpar banheiro', frequency: 'semanal', difficulty: 'dificil', assignedTo: 'isabella' },
  { name: 'Lavar louca', frequency: 'diaria', difficulty: 'facil', assignedTo: 'arthur' },
  { name: 'Tirar o lixo', frequency: 'diaria', difficulty: 'facil', assignedTo: null },
  { name: 'Passar aspirador', frequency: 'semanal', difficulty: 'medio', assignedTo: 'gabryel' },
  { name: 'Trocar roupa de cama', frequency: 'semanal', difficulty: 'medio', assignedTo: null },
];

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
    timezone: 'America/Sao_Paulo',
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

  const tasks = [];
  for (const data of TASKS) {
    tasks.push(
      await Task.create({
        household: household._id,
        createdBy: usersByUsername.rodrigo._id,
        name: data.name,
        frequency: data.frequency,
        difficulty: data.difficulty,
        assignedTo: data.assignedTo ? usersByUsername[data.assignedTo]._id : null,
      })
    );
  }

  // Uma execucao ja conferida e outra aguardando avaliacao.
  await TaskExecutionHistory.create({
    household: household._id,
    task: tasks[0]._id,
    executedBy: usersByUsername.isabella._id,
    note: 'Banheiro limpo e brilhando!',
    rating: 5,
    ratingNote: 'Ficou otimo, obrigada!',
  });

  await TaskExecutionHistory.create({
    household: household._id,
    task: tasks[1]._id,
    executedBy: usersByUsername.arthur._id,
    note: 'Louca lavada e guardada.',
  });

  console.log('');
  console.log('Casa:              ' + household.name);
  console.log('Codigo de convite: ' + household.inviteCode);
  console.log('Senha de todos:    ' + PASSWORD);
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
