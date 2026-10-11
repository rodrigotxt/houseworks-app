// schemas/auth.js
// Entrada de POST /auth/register e POST /auth/login.
// householdName/timezone criam a casa no proprio cadastro (modelo Household, Fase 1).

const { z } = require('zod');
const { email } = require('./common');

const registerSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Nome deve ter no minimo 2 caracteres.' })
    .max(80, { message: 'Nome deve ter no maximo 80 caracteres.' }),
  username: z
    .string()
    .trim()
    .min(3, { message: 'Nome de usuario deve ter no minimo 3 caracteres.' })
    .max(30, { message: 'Nome de usuario deve ter no maximo 30 caracteres.' })
    .regex(/^[a-zA-Z0-9._-]+$/, {
      message: 'Nome de usuario aceita apenas letras, numeros, ponto, hifen e underline.',
    }),
  email,
  password: z
    .string()
    .min(8, { message: 'Senha deve ter no minimo 8 caracteres.' })
    .max(72, { message: 'Senha deve ter no maximo 72 caracteres.' }),

  // Com householdName, o cadastro cria a casa e torna o usuario owner dela.
  householdName: z
    .string()
    .trim()
    .min(2, { message: 'O nome da casa deve ter no minimo 2 caracteres.' })
    .max(80, { message: 'O nome da casa deve ter no maximo 80 caracteres.' })
    .optional(),

  // Ignorado se householdName nao for informado.
  timezone: z.string().trim().min(1).max(64).optional(),
});

const loginSchema = z
  .strictObject({
    email: email.optional(),
    username: z.string().trim().min(3, { message: 'Nome de usuario invalido.' }).optional(),
    password: z.string().min(1, { message: 'Senha e obrigatoria.' }),
  })
  .refine((value) => Boolean(value.email || value.username), {
    message: 'Informe email ou nome de usuario.',
    path: ['email'],
  });

module.exports = { registerSchema, loginSchema };
