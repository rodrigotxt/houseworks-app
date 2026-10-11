// utils/asyncHandler.js
// Express 4 nao propaga rejeicao de promise para o errorHandler.
// Envolver o handler aqui e o que permite os controllers apenas lancarem ApiError,
// sem try/catch repetido em cada funcao.

module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
