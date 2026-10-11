// scripts/seed-volume.js
// Gera volume para medir as agregacoes de desempenho (aceite da Fase 4:
// p95 abaixo de 300ms com 50k ocorrencias).
//
// Uso:  node scripts/seed-volume.js [ocorrencias]     (padrao: 50000)
//
// Grava direto nas colecoes (insertMany), sem passar pela API: o objetivo e medir a
// LEITURA, nao a escrita. Os dados ficam coerentes com o modelo — ocorrencias unicas
// por {task, dueDate} e execucoes sempre ligadas a uma ocorrencia concluida.

const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('../models/User');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const TaskOccurrence = require('../models/TaskOccurrence');
const TaskExecution = require('../models/TaskExecution');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');
const { todayInZone, addDays } = require('../services/time');

dotenv.config();

const TIMEZONE = 'America/Sao_Paulo';
const MEMBROS = 5;
const TAREFAS = 10;
const DIAS_DE_HISTORICO = 730; // dois anos

const STATUS = ['done', 'done', 'done', 'done', 'overdue', 'pending', 'skipped'];

const aleatorio = (limite) => Math.floor(Math.random() * limite);

async function main() {
  const total = Number(process.argv[2]) || 50000;

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado. Gerando ' + total + ' ocorrencias...');

  await Promise.all([
    User.deleteMany(),
    Household.deleteMany(),
    Membership.deleteMany(),
    Task.deleteMany(),
    TaskOccurrence.deleteMany(),
    TaskExecution.deleteMany(),
  ]);

  const usuarios = [];
  for (let indice = 0; indice < MEMBROS; indice += 1) {
    usuarios.push(
      await User.create({
        name: 'Membro ' + (indice + 1),
        username: 'membro' + (indice + 1),
        email: 'membro' + (indice + 1) + '@example.com',
        password: 'a1b2c3d4',
      })
    );
  }

  const household = await Household.create({
    name: 'Casa de Volume',
    timezone: TIMEZONE,
    ownerId: usuarios[0]._id,
    inviteCode: generateInviteCode(),
    inviteCodeExpiresAt: inviteExpiry(),
  });

  await Membership.insertMany(
    usuarios.map((usuario, indice) => ({
      user: usuario._id,
      household: household._id,
      role: indice === 0 ? 'owner' : indice === 1 ? 'adult' : 'child',
    }))
  );

  const tarefas = await Task.insertMany(
    Array.from({ length: TAREFAS }, (unused, indice) => ({
      household: household._id,
      createdBy: usuarios[0]._id,
      name: 'Tarefa ' + (indice + 1),
      difficulty: 'medio',
      points: 3,
      assignedTo: usuarios[indice % MEMBROS]._id,
      recurrence: { frequency: 'diaria', startDate: addDays(todayInZone(TIMEZONE), -DIAS_DE_HISTORICO) },
    }))
  );

  // Uma ocorrencia por {task, dueDate}. Cada tarefa recebe datas DISTINTAS — repetir
  // uma data esbarraria no indice unico, que e justamente o que garante a idempotencia
  // do gerador.
  const ocorrencias = [];
  const hoje = todayInZone(TIMEZONE);
  const porTarefa = Math.ceil(total / TAREFAS);
  const historico = Math.max(DIAS_DE_HISTORICO, porTarefa);

  for (const tarefa of tarefas) {
    for (let dia = 0; dia < porTarefa; dia += 1) {
      ocorrencias.push({
        household: household._id,
        task: tarefa._id,
        dueDate: addDays(hoje, dia - historico),
        assignedTo: usuarios[aleatorio(MEMBROS)]._id,
        status: STATUS[aleatorio(STATUS.length)],
        points: 3,
      });
    }
  }

  // insertMany em lotes: um unico array gigante estoura o limite do driver.
  const LOTE = 5000;
  let gravadas = 0;

  for (let inicio = 0; inicio < ocorrencias.length; inicio += LOTE) {
    const lote = ocorrencias.slice(inicio, inicio + LOTE);
    const resultado = await TaskOccurrence.insertMany(lote, { ordered: false });
    gravadas += resultado.length;
  }

  console.log('Ocorrencias gravadas: ' + gravadas);

  // Execucoes para as concluidas.
  const concluidas = await TaskOccurrence.find({ status: 'done' }).select('_id task points dueDate');
  const execucoes = concluidas.map((ocorrencia) => ({
    household: household._id,
    occurrence: ocorrencia._id,
    task: ocorrencia.task,
    dueDate: ocorrencia.dueDate,
    executedBy: usuarios[aleatorio(MEMBROS)]._id,
    completionDate: new Date(),
    status: aleatorio(2) === 0 ? 'approved' : 'auto_approved',
    points: ocorrencia.points,
    rating: 1 + aleatorio(5),
  }));

  let execucoesGravadas = 0;
  for (let inicio = 0; inicio < execucoes.length; inicio += LOTE) {
    const resultado = await TaskExecution.insertMany(execucoes.slice(inicio, inicio + LOTE), {
      ordered: false,
    });
    execucoesGravadas += resultado.length;
  }

  console.log('Execucoes gravadas:  ' + execucoesGravadas);
  console.log('Casa: ' + household._id);

  await mongoose.connection.close();
}

main().catch((error) => {
  console.error('Falha ao gerar volume: ' + error.message);
  process.exit(1);
});
