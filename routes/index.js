// routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
//const otherRoutes = require('./other');

router.get('/', (req, res) => {
  res.send('Hello Docker Compose from Node.js!'); // Rota principal mantida aqui
});

router.use('/api/auth', authRoutes); // Prefixo '/api/auth' para as rotas de autenticação
//router.use('/api', otherRoutes); // Exemplo para outras rotas

module.exports = router;