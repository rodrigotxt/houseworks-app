process.env.NODE_ENV = 'test';

const { execFileSync } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

(async () => {
  const mem = await MongoMemoryServer.create();
  const uri = mem.getUri();

  console.log('--- rodando scripts/seed.js ---');
  execFileSync('node', ['scripts/seed.js'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { MONGO_URI: uri, NODE_ENV: 'development' }),
    stdio: 'inherit',
  });

  await mongoose.connect(uri);

  const User = require('./models/User');
  const Household = require('./models/Household');
  const Membership = require('./models/Membership');
  const Task = require('./models/Task');
  const TaskOccurrence = require('./models/TaskOccurrence');
  const TaskExecutionHistory = require('./models/TaskExecutionHistory');

  const counts = {
    users: await User.countDocuments(),
    households: await Household.countDocuments(),
    memberships: await Membership.countDocuments(),
    tasks: await Task.countDocuments(),
    occurrences: await TaskOccurrence.countDocuments(),
    executions: await TaskExecutionHistory.countDocuments(),
  };
  console.log('contagens:', JSON.stringify(counts));

  const esperado = { users: 5, households: 1, memberships: 5, tasks: 6, executions: 2 };
  Object.keys(esperado).forEach((k) => {
    if (counts[k] !== esperado[k]) throw new Error('contagem errada em ' + k + ': ' + counts[k]);
  });
  if (counts.occurrences < 100) throw new Error('agenda nao foi gerada: ' + counts.occurrences);

  const household = await Household.findById((await Membership.findOne()).household);

  // A tarefa diaria deve dominar a agenda (31 ocorrencias no horizonte de 30 dias).
  const porTarefa = await TaskOccurrence.aggregate([
    { $group: { _id: '$task', total: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  const tarefas = await Task.find().select('name recurrence.frequency');
  const nomeDe = {};
  tarefas.forEach((t) => { nomeDe[String(t._id)] = t.name + ' [' + t.recurrence.frequency + ']'; });
  console.log('ocorrencias por tarefa:');
  for (const linha of porTarefa) console.log('  ' + String(linha.total).padStart(3) + '  ' + nomeDe[String(linha._id)]);

  // Rodizio: uma tarefa semanal dividida entre 5 membros.
  const cama = await Task.findOne({ name: 'Trocar roupa de cama' });
  const doRodizio = await TaskOccurrence.find({ task: cama._id }).sort({ dueDate: 1 }).limit(5);
  console.log('rodizio (5 primeiras):', doRodizio.map((o) => String(o.assignedTo)).join(', '));
  console.log('rodizio usa membros distintos:', new Set(doRodizio.map((o) => String(o.assignedTo))).size === 5);

  const pontual = await Task.findOne({ name: 'Limpar a caixa de agua' });
  console.log('tarefa ocasional gerou:', await TaskOccurrence.countDocuments({ task: pontual._id }), 'ocorrencia(s)');

  console.log('concluidas:', await TaskOccurrence.countDocuments({ status: 'done' }));
  console.log('pendentes :', await TaskOccurrence.countDocuments({ status: 'pending' }));

  const amanha = require('./services/time').addDays(require('./services/time').todayInZone(household.timezone), 1);
  console.log('existe ocorrencia para amanha:', await TaskOccurrence.countDocuments({ dueDate: amanha }) > 0);

  // Agendador
  console.log('--- agendador ---');
  const cron = require('node-cron');
  console.log('expressao valida:', cron.validate('0 3 * * *'));
  const { startScheduler, stopScheduler } = require('./jobs/scheduler');
  const tarefa = startScheduler();
  console.log('agendador ativo:', Boolean(tarefa));
  stopScheduler();
  console.log('agendador parado:', true);

  await mongoose.disconnect();
  await mem.stop();
  console.log('VERIFICACAO OK');
})().catch((error) => {
  console.error('FALHOU: ' + (error.stack || error.message));
  process.exit(1);
});
