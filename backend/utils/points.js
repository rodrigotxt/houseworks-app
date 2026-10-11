// utils/points.js
// Pontuacao derivada da dificuldade. Fonte unica — o valor pode ser sobreposto
// por tarefa, mas o padrao nasce aqui.

const POINTS_BY_DIFFICULTY = {
  muito_facil: 1,
  facil: 2,
  medio: 3,
  dificil: 5,
  muito_dificil: 8,
};

function pointsForDifficulty(difficulty) {
  return POINTS_BY_DIFFICULTY[difficulty] || 0;
}

module.exports = { POINTS_BY_DIFFICULTY, pointsForDifficulty };
