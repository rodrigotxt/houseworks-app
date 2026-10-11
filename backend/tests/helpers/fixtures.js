// tests/helpers/fixtures.js
// Monta estado que a API ainda nao sabe criar.
//
// A criacao de execucao sai do contrato na Fase 1b: no desenho final ela acontece
// ao concluir uma ocorrencia (POST /occurrences/:id/complete), que chega na Fase 3.
// Ate la os testes gravam a execucao direto no modelo, reproduzindo exatamente o
// estado que a Fase 3 vai produzir pela API.

const TaskExecutionHistory = require('../../models/TaskExecutionHistory');

const { app, request, bearer } = require('./auth');

async function createTask(token, householdId, body) {
  const response = await request(app)
    .post('/api/v1/households/' + householdId + '/tasks')
    .set(bearer(token))
    .send(
      Object.assign(
        { name: 'Limpar banheiro', frequency: 'semanal', difficulty: 'dificil' },
        body || {}
      )
    );

  return response;
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

module.exports = { createTask, seedExecution };
