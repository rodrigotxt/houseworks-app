// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { registerSchema, loginSchema } = require('../schemas/auth');

// @route   POST /auth/register
// @desc    Registrar usuario
// @access  Publico
router.post('/register', validate({ body: registerSchema }), asyncHandler(authController.registerUser));

// @route   POST /auth/login
// @desc    Autenticar e emitir JWT
// @access  Publico
router.post('/login', validate({ body: loginSchema }), asyncHandler(authController.loginUser));

module.exports = router;
