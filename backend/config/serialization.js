// config/serialization.js
// Formato de saida dos documentos em JSON.
// O contrato (docs/openapi.yaml) define "id" e nao define "_id"/"__v".
//
// toObject E toJSON precisam receber as mesmas opcoes: o Mongoose serializa documentos
// populados usando o toObject do schema filho, nao o toJSON do pai. Sem isso, um
// `membership.user` populado voltaria com _id.

function createJsonOptions(options) {
  const extraOmit = (options && options.omit) || [];
  const extraTransform = (options && options.transform) || null;

  return {
    virtuals: true,
    versionKey: false,
    transform(document, returned) {
      delete returned._id;
      extraOmit.forEach((field) => {
        delete returned[field];
      });
      if (extraTransform) {
        extraTransform(document, returned);
      }
      return returned;
    },
  };
}

module.exports = { createJsonOptions };
