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

module.exports = { objectId, email };
