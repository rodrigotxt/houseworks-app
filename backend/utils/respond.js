// utils/respond.js
// Helpers do envelope de sucesso: { data } ou { data, meta }.
// Nenhum controller devolve corpo cru — sempre por aqui.

function ok(res, data, meta) {
  return res.status(200).json(meta === undefined ? { data } : { data, meta });
}

function created(res, data, meta) {
  return res.status(201).json(meta === undefined ? { data } : { data, meta });
}

function noContent(res) {
  return res.status(204).end();
}

// Meta de paginacao no formato de PageMeta de docs/openapi.yaml.
function pageMeta(page, pageSize, total) {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

module.exports = { ok, created, noContent, pageMeta };
