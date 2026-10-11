// tests/helpers/fixtures.js
// Atalhos para montar o cenario de teste.
//
// Depois da Fase 3 a criacao de execucao tem caminho proprio na API
// (POST /occurrences/:id/complete) e os testes usam esse caminho. O seedOccurrence
// continua existindo para montar estados que o gerador nao produz sozinho — tipicamente
// uma ocorrencia vencida no passado.

const TaskOccurrence = require('../../models/TaskOccurrence');
const { todayInZone } = require('../../services/time');

const { app, request, bearer } = require('./auth');

function defaultRecurrence(overrides) {
  return Object.assign(
    { frequency: 'semanal', weekdays: [6], startDate: todayInZone('America/Sao_Paulo') },
    overrides || {}
  );
}

async function createTask(token, householdId, body) {
  const response = await request(app)
    .post('/api/v1/households/' + householdId + '/tasks')
    .set(bearer(token))
    .send(
      Object.assign(
        { name: 'Limpar banheiro', difficulty: 'dificil', recurrence: defaultRecurrence() },
        body || {}
      )
    );

  return response;
}

async function seedOccurrence(fields) {
  return TaskOccurrence.create(
    Object.assign({ status: 'pending', points: 1, dueDate: todayInZone('America/Sao_Paulo') }, fields)
  );
}

// Primeira ocorrencia de uma tarefa, ja materializada pela criacao dela.
async function firstOccurrence(householdId, taskId) {
  return TaskOccurrence.findOne({ household: householdId, task: taskId }).sort({ dueDate: 1 });
}

function completeOccurrence(token, occurrenceId, body) {
  return request(app)
    .post('/api/v1/occurrences/' + occurrenceId + '/complete')
    .set(bearer(token))
    .send(body || {});
}

module.exports = {
  createTask,
  seedOccurrence,
  firstOccurrence,
  completeOccurrence,
  defaultRecurrence,
};
