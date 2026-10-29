// schemas/reminder.js
// Entrada das rotas de lembrete, notificacao e push (docs/openapi.yaml).

const { z } = require('zod');
const { objectId } = require('./common');
const { FREQUENCIES, CHANNELS, STATUSES, TIME_PATTERN } = require('../models/Reminder');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato AAAA-MM-DD.' });

const timeString = z
  .string()
  .regex(TIME_PATTERN, { message: 'Use o formato HH:MM (24 horas).' });

const title = z
  .string()
  .trim()
  .min(3, { message: 'O titulo do lembrete deve ter no minimo 3 caracteres.' })
  .max(100, { message: 'O titulo do lembrete deve ter no maximo 100 caracteres.' });

const notes = z
  .string()
  .trim()
  .max(500, { message: 'As observacoes devem ter no maximo 500 caracteres.' });

const schedule = z
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
    // A hora local da casa e o que distingue o lembrete da tarefa.
    time: timeString,
  })
  .refine(
    (value) => value.frequency !== 'semanal' || (value.weekdays && value.weekdays.length > 0),
    {
      message: 'Informe ao menos um dia da semana para frequencia semanal.',
      path: ['weekdays'],
    }
  )
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: 'A data final da recorrencia nao pode ser anterior a inicial.',
    path: ['endDate'],
  });

const recipients = z
  .array(objectId)
  .min(1, { message: 'Informe ao menos um destinatario.' })
  .max(50, { message: 'Um lembrete atende no maximo 50 destinatarios.' });

const channels = z
  .array(z.enum(CHANNELS), {
    message: 'Os canais sao in_app, push, email ou sms.',
  })
  .min(1, { message: 'Informe ao menos um canal.' })
  .max(CHANNELS.length, { message: 'Canal repetido.' });

const task = objectId.nullable();

const createReminderSchema = z
  .strictObject({
    title,
    notes: notes.optional(),
    schedule,
    recipients: recipients.optional(),
    allMembers: z.boolean().optional(),
    channels: channels.optional(),
    task: task.optional(),
    skipIfTaskDone: z.boolean().optional(),
  })
  .refine((value) => !value.allMembers || !value.recipients || value.recipients.length === 0, {
    message: 'Com allMembers, nao envie destinatarios.',
    path: ['recipients'],
  });

const updateReminderSchema = z
  .strictObject({
    title: title.optional(),
    notes: notes.optional(),
    schedule: schedule.optional(),
    recipients: recipients.optional(),
    allMembers: z.boolean().optional(),
    channels: channels.optional(),
    task: task.optional(),
    skipIfTaskDone: z.boolean().optional(),
    status: z.enum(STATUSES, {
      message: 'O status deve ser active, paused ou archived.',
    }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

const listRemindersQuerySchema = z.strictObject({
  status: z
    .enum([...STATUSES, 'all'], {
      message: 'O status deve ser active, paused, archived ou all.',
    })
    .optional(),
  recipient: z.union([z.literal('me'), objectId]).optional(),
  task: objectId.optional(),
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

const snoozeReminderSchema = z.strictObject({
  minutes: z
    .number()
    .int({ message: 'Os minutos devem ser um numero inteiro.' })
    .min(1, { message: 'Adie por pelo menos 1 minuto.' })
    .max(1440, { message: 'Adie por no maximo 1440 minutos (24 horas).' }),
});

const listNotificationsQuerySchema = z.strictObject({
  unread: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const pushSubscriptionSchema = z.strictObject({
  endpoint: z.url({ message: 'Endpoint de push invalido.' }),
  keys: z.strictObject({
    p256dh: z.string().min(1, { message: 'Chave p256dh ausente.' }),
    auth: z.string().min(1, { message: 'Chave auth ausente.' }),
  }),
  userAgent: z.string().trim().max(300).optional(),
});

const pushUnsubscribeSchema = z.strictObject({
  endpoint: z.url({ message: 'Endpoint de push invalido.' }),
});

module.exports = {
  createReminderSchema,
  updateReminderSchema,
  listRemindersQuerySchema,
  snoozeReminderSchema,
  listNotificationsQuerySchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  schedule,
  dateString,
  timeString,
};
