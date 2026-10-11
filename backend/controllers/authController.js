// controllers/authController.js
// Sem try/catch: erros lancados viram o envelope no errorHandler central.
// Sem res.json cru: toda resposta de sucesso passa pelos helpers de utils/respond.

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { created, ok } = require('../utils/respond');

// 1h. Precisa bater com o expiresIn anunciado no contrato e com o front (ROADMAP C1).
const TOKEN_TTL_SECONDS = 3600;

// Nunca serializar o hash da senha. Projecao explicita, nao delete de campo.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// @desc    Registrar usuario
// @route   POST /api/v1/auth/register
// @access  Publico
exports.registerUser = async (req, res) => {
  const { name, username, email, password } = req.body;

  const emailTaken = await User.findOne({ email });
  if (emailTaken) {
    throw ApiError.conflict('Este email ja esta registrado.', ErrorCode.EMAIL_ALREADY_REGISTERED);
  }

  const usernameTaken = await User.findOne({ username });
  if (usernameTaken) {
    throw ApiError.conflict(
      'Este nome de usuario ja esta registrado.',
      ErrorCode.USERNAME_ALREADY_REGISTERED
    );
  }

  // A senha e criptografada pelo pre-save do modelo.
  const user = await new User({ name, username, email, password }).save();

  return created(res, { user: publicUser(user) });
};

// @desc    Autenticar e emitir JWT
// @route   POST /api/v1/auth/login
// @access  Publico
exports.loginUser = async (req, res) => {
  const { username, email, password } = req.body;
  const identifier = username || email;

  const user = await User.findByEmailOrUsername(identifier);

  // Mesma resposta para usuario inexistente e senha errada: nao revela qual falhou.
  if (!user) {
    throw ApiError.unauthenticated('Credenciais invalidas.', ErrorCode.INVALID_CREDENTIALS);
  }

  const passwordMatches = await user.matchPassword(password);
  if (!passwordMatches) {
    throw ApiError.unauthenticated('Credenciais invalidas.', ErrorCode.INVALID_CREDENTIALS);
  }

  const token = jwt.sign(
    { user: { id: user.id, email: user.email, username: user.username } },
    config.jwtSecret,
    { expiresIn: TOKEN_TTL_SECONDS }
  );

  return ok(res, { token, expiresIn: TOKEN_TTL_SECONDS, user: publicUser(user) });
};

module.exports.publicUser = publicUser;
module.exports.TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
