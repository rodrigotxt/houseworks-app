// config/serialization.js
// Formato de saida dos documentos em JSON.
// O contrato (docs/openapi.yaml) define "id" e nao define "_id"/"__v":
// padronizar aqui evita cada controller inventar seu proprio formato de resposta.

module.exports = {
  virtuals: true,
  versionKey: false,
  transform(document, returned) {
    delete returned._id;
    return returned;
  },
};
