// middlewares/errorHandler.js
// Unico lugar que escreve um corpo de erro: { error: { code, message, details, requestId } }.
// Nada de res.status(500).send('texto') espalhado pelos controllers.

const config = require('../config');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');

const DUPLICATE_KEY_CODES = {
  email: ErrorCode.EMAIL_ALREADY_REGISTERED,
  username: ErrorCode.USERNAME_ALREADY_REGISTERED,
};

const DUPLICATE_KEY_MESSAGES = {
  email: 'Este email ja esta registrado.',
  username: 'Este nome de usuario ja esta registrado.',
};

// Traduz erros conhecidos de terceiros (Mongoose) para o catalogo.
function fromMongoose(err) {
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.keys(err.errors).map((field) => ({
      field,
      issue: err.errors[field].message,
    }));
    return ApiError.badRequest('Um ou mais campos sao invalidos.', details);
  }

  if (err.name === 'CastError') {
    return ApiError.badRequest('Identificador invalido.', [
      { field: err.path, issue: 'O valor informado nao e um identificador valido.' },
    ]);
  }

  // Corpo que nao e JSON valido chega aqui como SyntaxError do body-parser.
  if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    return ApiError.badRequest('O corpo da requisicao nao e um JSON valido.', [
      { field: 'body', issue: 'JSON malformado.' },
    ]);
  }

  if (err.code === 11000) {
    const field = err.keyPattern ? Object.keys(err.keyPattern)[0] : null;
    return ApiError.conflict(
      DUPLICATE_KEY_MESSAGES[field] || 'Registro duplicado.',
      DUPLICATE_KEY_CODES[field] || ErrorCode.CONFLICT
    );
  }

  return null;
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isApiError = err instanceof ApiError;
  const normalized = isApiError ? err : fromMongoose(err) || ApiError.internal();
  const requestId = req.id;

  // Erro de programacao (nao previsto): registra com stack para diagnostico.
  if (!isApiError && normalized.status >= 500) {
    console.error(
      '[error] requestId=' + requestId + ' ' + req.method + ' ' + req.originalUrl,
      err && err.stack ? err.stack : err
    );
  } else if (normalized.status >= 500) {
    console.error(
      '[error] requestId=' + requestId + ' ' + req.method + ' ' + req.originalUrl,
      normalized.stack
    );
  } else if (config.nodeEnv !== 'test') {
    console.warn(
      '[warn] requestId=' + requestId + ' ' + normalized.status + ' ' +
      normalized.code + ' ' + req.method + ' ' + req.originalUrl
    );
  }

  return res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details || [],
      requestId,
    },
  });
}

module.exports = errorHandler;
module.exports.fromMongoose = fromMongoose;
