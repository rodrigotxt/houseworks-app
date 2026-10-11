// utils/pagination.js
// Paginacao e ordenacao com allow-list de campos.
// Ordenar por campo arbitrario vindo da query seria um vetor de consulta cara e de
// comportamento imprevisivel — so os campos listados aqui sao aceitos.

function buildSort(sort, allowedFields, fallback) {
  const fallbackDescending = fallback.startsWith('-');
  const fallbackField = fallbackDescending ? fallback.slice(1) : fallback;

  const raw = typeof sort === 'string' && sort.length > 0 ? sort : fallback;
  const descending = raw.startsWith('-');
  const field = descending ? raw.slice(1) : raw;

  if (allowedFields.indexOf(field) === -1) {
    return { [fallbackField]: fallbackDescending ? -1 : 1 };
  }

  return { [field]: descending ? -1 : 1 };
}

function skipFor(page, pageSize) {
  return (page - 1) * pageSize;
}

// Escapa metacaracteres de regex: o termo de busca vem do usuario.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { buildSort, skipFor, escapeRegex };
