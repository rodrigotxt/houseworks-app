// schemas/common.js
// Tipos reutilizados pelos schemas de entrada.

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, { message: 'Identificador invalido.' });

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Email invalido.' }));

// Identidade de uma pessoa. Extraidos daqui porque DOIS caminhos criam usuario --
// o cadastro publico (POST /auth/register) e o cadastro feito pelo dono da casa
// (POST /households/:id/members) -- e as regras nao podem divergir entre eles.
const personName = z
  .string()
  .trim()
  .min(2, { message: 'Nome deve ter no minimo 2 caracteres.' })
  .max(80, { message: 'Nome deve ter no maximo 80 caracteres.' });

const username = z
  .string()
  .trim()
  .min(3, { message: 'Nome de usuario deve ter no minimo 3 caracteres.' })
  .max(30, { message: 'Nome de usuario deve ter no maximo 30 caracteres.' })
  .regex(/^[a-zA-Z0-9._-]+$/, {
    message: 'Nome de usuario aceita apenas letras, numeros, ponto, hifen e underline.',
  });

// O teto de 72 e o limite do bcrypt: acima disso a senha seria truncada em silencio.
const password = z
  .string()
  .min(8, { message: 'Senha deve ter no minimo 8 caracteres.' })
  .max(72, { message: 'Senha deve ter no maximo 72 caracteres.' });

module.exports = { objectId, email, personName, username, password };
