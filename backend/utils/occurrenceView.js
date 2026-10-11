// utils/occurrenceView.js
// O contrato define "isLate" como CALCULADO, nao armazenado. Como o calculo depende do
// fuso da casa (o dia local em que a conclusao aconteceu), ele nao pode ser um virtual
// do modelo: o documento nao conhece a casa.

const { DateTime } = require('luxon');
const { zoneOf } = require('../services/time');

function occurrenceView(occurrence, timezone) {
  const view = occurrence.toJSON ? occurrence.toJSON() : occurrence;

  if (occurrence.completedAt) {
    const localCompletion = DateTime.fromJSDate(occurrence.completedAt)
      .setZone(zoneOf(timezone))
      .toISODate();

    view.isLate = localCompletion > occurrence.dueDate;
  } else {
    view.isLate = false;
  }

  return view;
}

function occurrenceList(items, timezone) {
  return items.map((ocorrencia) => occurrenceView(ocorrencia, timezone));
}

module.exports = { occurrenceView, occurrenceList };
