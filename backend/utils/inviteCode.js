// utils/inviteCode.js
// Codigo de convite legivel por humanos, para ser ditado em voz alta.
// Alfabeto sem I, O, 0 e 1 — os caracteres que as pessoas confundem ao digitar.

const { randomInt } = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateInviteCode() {
  let code = '';

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }

  return code;
}

// Validade padrao do convite.
const INVITE_TTL_HOURS = 24 * 7;

function inviteExpiry(from) {
  const base = from ? new Date(from) : new Date();
  return new Date(base.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
}

module.exports = { generateInviteCode, inviteExpiry, INVITE_TTL_HOURS, CODE_LENGTH };
