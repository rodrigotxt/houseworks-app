// config/index.js
require('dotenv').config(); // Garante que as variáveis de ambiente sejam carregadas

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoURI: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
};