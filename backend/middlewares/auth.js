// middlewares/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config'); // Importa o jwtSecret do seu arquivo de configuração

// Middleware para proteger rotas
module.exports = function (req, res, next) {
  // Obter o token do cabeçalho
  const token = req.header('x-auth-token');

  // Verificar se não há token
  if (!token) {
    return res.status(401).json({ message: 'Nenhum token, autorização negada.' });
  }

  // Verificar o token
  try {
    // Verifica se o token começa com "Bearer " e o remove, se for o caso
    const tokenWithoutBearer = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

    // Decodifica o token usando o segredo JWT
    const decoded = jwt.verify(tokenWithoutBearer, config.jwtSecret);

    // Anexar o objeto de usuário (com id e email) à requisição
    req.user = decoded.user;
    next(); // Continua para a próxima função middleware/rota
  } catch (err) {
    res.status(401).json({ message: 'Token não é válido.' });
  }
};
