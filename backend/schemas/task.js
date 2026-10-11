// schemas/task.js
// Entrada de POST /tasks e PUT /tasks/:id.
//
// Fase 0 valida o formato ATUAL do modelo (frequency como string).
// Na Fase 2 o contrato passa a exigir o objeto "recurrence" (docs/openapi.yaml) e este
// schema acompanha. O que ja vale aqui: allow-list estrita de campos, que fecha o
// mass-assignment (o baseline aceitava "status" arbitrario vindo do corpo).

const { z } = require('zod');

const FREQUENCIES = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];
const DIFFICULTIES = ['muito_facil', 'facil', 'medio', 'dificil', 'muito_dificil'];
const STATUSES = ['pendente', 'concluida', 'em_andamento'];

const name = z
  .string()
  .trim()
  .min(3, { message: 'O nome da tarefa deve ter no minimo 3 caracteres.' })
  .max(100, { message: 'O nome da tarefa deve ter no maximo 100 caracteres.' });

const frequency = z.enum(FREQUENCIES, {
  message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
});

const difficulty = z.enum(DIFFICULTIES, {
  message: 'A dificuldade deve ser muito_facil, facil, medio, dificil ou muito_dificil.',
});

const status = z.enum(STATUSES, {
  message: 'O status deve ser pendente, concluida ou em_andamento.',
});

const createTaskSchema = z.strictObject({ name, frequency, difficulty });

// nextDueDate e lastCompletedDate NAO sao aceitos: sao derivados (contrato os marca
// como somente-leitura). Ninguem os define pelo corpo.
const updateTaskSchema = z
  .strictObject({
    name: name.optional(),
    frequency: frequency.optional(),
    difficulty: difficulty.optional(),
    status: status.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  FREQUENCIES,
  DIFFICULTIES,
  STATUSES,
};
