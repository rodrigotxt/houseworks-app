// middlewares/notFound.js
// Ultimo recurso antes do errorHandler: nenhuma rota casou.

const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');

function notFound(req, res, next) {
  next(
    ApiError.notFound(
      'Rota nao encontrada: ' + req.method + ' ' + req.originalUrl,
      ErrorCode.ROUTE_NOT_FOUND
    )
  );
}

module.exports = notFound;
