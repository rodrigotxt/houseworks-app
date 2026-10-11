// middlewares/validate.js
// Validacao de entrada com zod. Contrato: docs/openapi.yaml (ValidacaoIssue).
//
// Uso:  router.post('/', validate({ body: createTaskSchema }), controller)
//
// O corpo validado SUBSTITUI req.body (campos fora do schema em .strict() sao rejeitados,
// o que fecha o mass-assignment). Query e params ficam em req.validatedQuery /
// req.validatedParams porque req.query e um getter no Express.

const ApiError = require('../utils/apiError');

const SOURCE_LABELS = {
  body: 'corpo da requisicao',
  query: 'parametros de consulta',
  params: 'parametros de rota',
};

function toDetails(zodError, source) {
  return zodError.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : SOURCE_LABELS[source],
    issue: issue.message,
  }));
}

function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    const sources = Object.keys(schemas || {});

    for (const source of sources) {
      const raw = source === 'body' ? req.body : req[source];
      const result = schemas[source].safeParse(raw);

      if (!result.success) {
        return next(
          ApiError.badRequest(
            'Um ou mais campos sao invalidos.',
            toDetails(result.error, source)
          )
        );
      }

      if (source === 'body') {
        req.body = result.data;
      } else if (source === 'query') {
        req.validatedQuery = result.data;
      } else {
        req.validatedParams = result.data;
      }
    }

    return next();
  };
}

module.exports = validate;
