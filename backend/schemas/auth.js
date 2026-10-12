// schemas/auth.js
// Entrada de POST /auth/register e POST /auth/login.
// householdName/timezone criam a casa no proprio cadastro (modelo Household, Fase 1).

const { z } = require('zod');
// Nome, usuario e senha vem de common.js: o cadastro publico e o cadastro feito pelo dono
// da casa criam a mesma entidade, e as regras nao podem divergir entre os dois caminhos.
const { email, personName, username, password } = require('./common');

const registerSchema = z.strictObject({
  name: personName,
  username,
  email,
  password,

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

// Troca de senha pelo proprio dono da conta.
//
// A senha ATUAL e exigida mesmo com a sessao ja autenticada: sem isso, um token roubado
// (ou um computador deixado aberto) bastaria para trancar o dono fora da propria conta.
const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, { message: 'Informe a senha atual.' }),
  newPassword: password,
});

module.exports = { registerSchema, loginSchema, changePasswordSchema };
