// utils/audit.js
// Registro de eventos destrutivos ou de mudanca de estado que precisam sobreviver ao
// request. O contrato exige que desfazer uma execucao "nunca apague silenciosamente".
//
// Hoje grava em log estruturado. Se a operacao passar a exigir consulta de auditoria,
// isto vira uma colecao — o ponto de chamada nao muda.

function audit(event, payload) {
  console.log('[audit] ' + event + ' ' + JSON.stringify(payload));
}

module.exports = { audit };
