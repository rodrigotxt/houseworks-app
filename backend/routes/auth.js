// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireAuth, requireRenewableAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const asyncHandler = require('../utils/asyncHandler');
const { authLimiter } = require('../middlewares/rateLimit');
const { registerSchema, loginSchema, changePasswordSchema } = require('../schemas/auth');

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

// @route   PATCH /auth/password
// @desc    Trocar a propria senha (derruba as outras sessoes)
// @access  Privado
// Passa pelo authLimiter porque a senha ATUAL e verificada aqui: sem limite, esta rota vira
// um lugar para adivinhar a senha de quem deixou a sessao aberta.
router.patch(
  '/password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
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
//
// Usa requireRenewableAuth, e nao requireAuth: e o unico lugar onde um token EXPIRADO
// ainda serve — desde que dentro da janela de sessao. Com requireAuth, renovar exigia
// um token valido, o que tornava a renovacao impossivel exatamente quando ela e precisa.
router.post('/refresh', requireRenewableAuth, asyncHandler(authController.refreshToken));

module.exports = router;
