// app.js
const express = require('express');
const cors = require('cors');
const config = require('./config'); // Importa as configurações globais
const connectDB = require('./config/db'); // Importa a função de conexão com o DB
const routes = require('./routes'); // Importa as rotas centralizadas

// Inicialização do App Express
const app = express();


// Lista de origens permitidas
const allowedOrigins = [
    'http://localhost:3000',
    'http://backend:3000',
    'http://localhost',
  ];
  
// Configurações do CORS
const corsOptions = {
    origin: function (origin, callback) {
      // Permite requisições sem origem (como de clientes mobile ou curl)
      // OU se a origem está na lista de permitidas
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Não permitido por CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Métodos HTTP permitidos
    credentials: true, // Habilita o envio de cookies de credenciais (muito importante para JWT com cookies HTTP-only)
    optionsSuccessStatus: 204 // Alguns navegadores esperam 204 para pré-voo OPTIONS
  };
  
  // Aplique o middleware CORS com as opções configuradas
  app.use(cors(corsOptions));
  
// Middlewares
app.use(express.json());

// Conexão com o MongoDB
connectDB();

// Usar as rotas
app.use('/', routes);


module.exports = app; // Exporta o aplicativo Express para ser usado por server.js