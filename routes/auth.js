// routes/auth.js
const express = require('express');
const router = express.Router(); // Cria um roteador Express
const authController = require('../controllers/authController'); // Importa o controlador

// Rota de Registro
router.post('/register', authController.registerUser);

// Rota de Login
router.post('/login', authController.loginUser);

module.exports = router; // Exporta o roteador