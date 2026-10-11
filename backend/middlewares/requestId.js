// middlewares/requestId.js
// Correlaciona a resposta com os logs do servidor.
// Reaproveita o X-Request-Id enviado pelo cliente (util em chamadas encadeadas)
// ou gera um novo. Sempre devolve o header na resposta.

const { randomUUID } = require('crypto');

const HEADER = 'X-Request-Id';
const MAX_LENGTH = 128;

function requestId(req, res, next) {
  const incoming = req.get(HEADER);
  const sanitized = typeof incoming === 'string' ? incoming.trim().slice(0, MAX_LENGTH) : '';
  const id = sanitized || randomUUID();

  req.id = id;
  res.setHeader(HEADER, id);
  next();
}

module.exports = requestId;
module.exports.HEADER = HEADER;
