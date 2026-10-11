// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { authLimiter } = require('../middlewares/rateLimit');
const { registerSchema, loginSchema } = require('../schemas/auth');

// @route   POST /auth/register
// @desc    Registrar usuario (opcionalmente criando a casa)
// @access  Publico
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.registerUser)
);

// @route   POST /auth/login
// @desc    Autenticar e emitir JWT
// @access  Publico
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.loginUser)
);

// @route   GET /auth/me
// @desc    Usuario autenticado e suas memberships
// @access  Privado
router.get('/me', requireAuth, asyncHandler(authController.me));

// @route   POST /auth/logout
// @desc    Encerrar sessao (revoga o token e limpa o cookie)
// @access  Privado
router.post('/logout', requireAuth, asyncHandler(authController.logoutUser));

// @route   POST /auth/refresh
// @desc    Renovar o token (rotaciona o atual)
// @access  Privado
router.post('/refresh', requireAuth, asyncHandler(authController.refreshToken));

module.exports = router;
