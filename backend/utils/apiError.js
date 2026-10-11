// utils/apiError.js
// Erro de aplicacao com status HTTP e codigo do catalogo.
// Qualquer erro lancado com throw chega ao errorHandler central e vira o envelope de erro.

const ErrorCode = require('./errorCodes');

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || [];
  }

  static badRequest(message, details) {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message, code) {
    return new ApiError(401, code || ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message, code) {
    return new ApiError(403, code || ErrorCode.FORBIDDEN, message);
  }

  static notFound(message, code) {
    return new ApiError(404, code || ErrorCode.ROUTE_NOT_FOUND, message);
  }

  static conflict(message, code) {
    return new ApiError(409, code || ErrorCode.CONFLICT, message);
  }

  static tooManyRequests(message) {
    return new ApiError(
      429,
      ErrorCode.RATE_LIMITED,
      message || 'Muitas tentativas. Tente novamente em instantes.'
    );
  }

  static internal(message) {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, message || 'Erro interno do servidor.');
  }

  static unavailable(message) {
    return new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, message || 'Servico indisponivel.');
  }
}

module.exports = ApiError;
