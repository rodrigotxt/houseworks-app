// tests/helpers/fixtures.js
// Monta estado que a API ainda nao sabe criar.
//
// A criacao de execucao sai do contrato na Fase 1b: no desenho final ela acontece
// ao concluir uma ocorrencia (POST /occurrences/:id/complete), que chega na Fase 3.
// Ate la os testes gravam a execucao direto no modelo, reproduzindo exatamente o
// estado que a Fase 3 vai produzir pela API.

const TaskExecutionHistory = require('../../models/TaskExecutionHistory');
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

// Ocorrencia gravada direto no modelo. Usada para montar estados que o gerador nao
// produz sozinho — tipicamente uma ocorrencia vencida no passado.
async function seedOccurrence(fields) {
  return TaskOccurrence.create(
    Object.assign({ status: 'pending', points: 1, dueDate: todayInZone('America/Sao_Paulo') }, fields)
  );
}

async function seedExecution(fields) {
  return TaskExecutionHistory.create(
    Object.assign(
      {
        completionDate: new Date(),
        note: 'Feito.',
      },
      fields
    )
  );
}

module.exports = { createTask, seedExecution, seedOccurrence, defaultRecurrence };
