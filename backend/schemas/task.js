// schemas/task.js
// Entrada das rotas de tarefa (docs/openapi.yaml).
// Fase 2 troca "frequency" pelo objeto "recurrence".

const { z } = require('zod');
const { objectId } = require('./common');
const { FREQUENCIES, DIFFICULTIES, STATUSES } = require('../models/Task');

const name = z
  .string()
  .trim()
  .min(3, { message: 'O nome da tarefa deve ter no minimo 3 caracteres.' })
  .max(100, { message: 'O nome da tarefa deve ter no maximo 100 caracteres.' });

const description = z
  .string()
  .trim()
  .max(500, { message: 'A descricao deve ter no maximo 500 caracteres.' });

const frequency = z.enum(FREQUENCIES, {
  message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
});

const difficulty = z.enum(DIFFICULTIES, {
  message: 'A dificuldade deve ser muito_facil, facil, medio, dificil ou muito_dificil.',
});

const status = z.enum(STATUSES, {
  message: 'O status deve ser active ou archived.',
});

const points = z
  .number()
  .int({ message: 'Os pontos devem ser um numero inteiro.' })
  .min(0, { message: 'Os pontos nao podem ser negativos.' })
  .max(100, { message: 'Os pontos devem ser no maximo 100.' });

// null = qualquer membro pode assumir.
const assignedTo = objectId.nullable();

const createTaskSchema = z.strictObject({
  name,
  description: description.optional(),
  frequency,
  difficulty,
  points: points.optional(),
  assignedTo: assignedTo.optional(),
});

const updateTaskSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    frequency: frequency.optional(),
    difficulty: difficulty.optional(),
    points: points.optional(),
    assignedTo: assignedTo.optional(),
    status: status.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

const listTasksQuerySchema = z.strictObject({
  status: status.optional(),
  // "unassigned" filtra as tarefas sem responsavel fixo.
  assignedTo: z.union([z.literal('unassigned'), objectId]).optional(),
  frequency: frequency.optional(),
  difficulty: difficulty.optional(),
  q: z
    .string()
    .trim()
    .min(2, { message: 'A busca deve ter no minimo 2 caracteres.' })
    .max(100, { message: 'A busca deve ter no maximo 100 caracteres.' })
    .optional(),
  sort: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  FREQUENCIES,
  DIFFICULTIES,
  STATUSES,
};
