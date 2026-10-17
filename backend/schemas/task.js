// schemas/task.js
// Entrada das rotas de tarefa (docs/openapi.yaml).

const { z } = require('zod');
const { objectId } = require('./common');
const { FREQUENCIES, DIFFICULTIES, STATUSES, ASSIGNMENT_STRATEGIES } = require('../models/Task');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato AAAA-MM-DD.' });

const name = z
  .string()
  .trim()
  .min(3, { message: 'O nome da tarefa deve ter no minimo 3 caracteres.' })
  .max(100, { message: 'O nome da tarefa deve ter no maximo 100 caracteres.' });

const description = z
  .string()
  .trim()
  .max(500, { message: 'A descricao deve ter no maximo 500 caracteres.' });

const difficulty = z.enum(DIFFICULTIES, {
  message: 'A dificuldade deve ser muito_facil, facil, medio, dificil ou muito_dificil.',
});

const status = z.enum(STATUSES, { message: 'O status deve ser active ou archived.' });

const assignmentStrategy = z.enum(ASSIGNMENT_STRATEGIES, {
  message: 'A estrategia de atribuicao deve ser fixed ou rotate.',
});

const points = z
  .number()
  .int({ message: 'Os pontos devem ser um numero inteiro.' })
  .min(0, { message: 'Os pontos nao podem ser negativos.' })
  .max(100, { message: 'Os pontos devem ser no maximo 100.' });

// Nula e permitida de proposito: e assim que se LIMPA uma estimativa ja salva.
const estimatedMinutes = z
  .number()
  .int({ message: 'A estimativa deve ser um numero inteiro de minutos.' })
  .min(1, { message: 'A estimativa deve ser de pelo menos 1 minuto.' })
  .max(1440, { message: 'A estimativa deve ser no maximo 1440 minutos (24 horas).' })
  .nullable();

const assignedTo = objectId.nullable();

const recurrence = z
  .strictObject({
    frequency: z.enum(FREQUENCIES, {
      message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
    }),
    interval: z
      .number()
      .int({ message: 'O intervalo deve ser um numero inteiro.' })
      .min(1, { message: 'O intervalo minimo e 1.' })
      .max(52, { message: 'O intervalo maximo e 52.' })
      .optional(),
    // 0 = domingo.
    weekdays: z
      .array(
        z.number().int().min(0, { message: 'O dia da semana vai de 0 a 6.' }).max(6, {
          message: 'O dia da semana vai de 0 a 6.',
        })
      )
      .min(1, { message: 'Informe ao menos um dia da semana.' })
      .optional(),
    dayOfMonth: z
      .number()
      .int({ message: 'O dia do mes deve ser um numero inteiro.' })
      .min(1, { message: 'O dia do mes minimo e 1.' })
      .max(31, { message: 'O dia do mes maximo e 31.' })
      .optional(),
    startDate: dateString,
    endDate: dateString.optional(),
  })
  .refine((value) => value.frequency !== 'semanal' || (value.weekdays && value.weekdays.length > 0), {
    message: 'Informe ao menos um dia da semana para frequencia semanal.',
    path: ['weekdays'],
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'A data final da recorrencia nao pode ser anterior a inicial.',
    path: ['endDate'],
  });

const createTaskSchema = z.strictObject({
  name,
  description: description.optional(),
  recurrence,
  difficulty,
  points: points.optional(),
  estimatedMinutes: estimatedMinutes.optional(),
  assignedTo: assignedTo.optional(),
  assignmentStrategy: assignmentStrategy.optional(),
});

const updateTaskSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    recurrence: recurrence.optional(),
    difficulty: difficulty.optional(),
    points: points.optional(),
    estimatedMinutes: estimatedMinutes.optional(),
    assignedTo: assignedTo.optional(),
    assignmentStrategy: assignmentStrategy.optional(),
    status: status.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

const listTasksQuerySchema = z
  .strictObject({
    status: status.optional(),
    // "unassigned" filtra as tarefas sem responsavel fixo.
    assignedTo: z.union([z.literal('unassigned'), objectId]).optional(),
    frequency: z
      .enum(FREQUENCIES, {
        message: 'A frequencia deve ser diaria, semanal, mensal, anual ou ocasional.',
      })
      .optional(),
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
  recurrence,
  dateString,
};
