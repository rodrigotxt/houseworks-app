// app.js
const express = require('express');
const config = require('./config'); // Importa as configurações globais
const connectDB = require('./config/db'); // Importa a função de conexão com o DB
const routes = require('./routes'); // Importa as rotas centralizadas

// Inicialização do App Express
const app = express();

// Middlewares
app.use(express.json());

// Conexão com o MongoDB
connectDB();

// Usar as rotas
app.use('/', routes);


module.exports = app; // Exporta o aplicativo Express para ser usado por server.js