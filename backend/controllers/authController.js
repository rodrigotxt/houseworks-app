// controllers/authController.js
// Sem try/catch: erros lancados viram o envelope no errorHandler central.
// Sem res.json cru: toda resposta de sucesso passa pelos helpers de utils/respond.

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Household = require('../models/Household');
const Membership = require('../models/Membership');
const config = require('../config');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { created, ok, noContent } = require('../utils/respond');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');
const {
  signToken,
  revoke,
  setAuthCookie,
  clearAuthCookie,
} = require('../utils/tokens');

// Validade configuravel (JWT_EXPIRES_IN em segundos), 1h por padrao. E o mesmo valor
// anunciado no campo expiresIn da resposta e na validade do cookie.
const TOKEN_TTL_SECONDS = config.tokenTtlSeconds;

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

// @desc    Registrar usuario (opcionalmente ja criando a casa)
// @route   POST /api/v1/auth/register
// @access  Publico
exports.registerUser = async (req, res) => {
  const { name, username, email, password, householdName, timezone } = req.body;

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

  const payload = { user: publicUser(user) };

  // Com householdName, o cadastro ja cria a casa e torna o usuario owner dela:
  // e o onboarding de uma familia nova em uma unica chamada.
  if (householdName) {
    const household = await new Household({
      name: householdName,
      timezone,
      ownerId: user._id,
      inviteCode: generateInviteCode(),
      inviteCodeExpiresAt: inviteExpiry(),
    }).save();

    await new Membership({
      user: user._id,
      household: household._id,
      role: 'owner',
    }).save();

    payload.household = household;
  }

  return created(res, payload);
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

  // O token carrega apenas a identidade e o jti. Casa e papel sao resolvidos por
  // requisicao contra a Membership, porque um usuario pode pertencer a varias casas.
  const { token } = signToken(user);

  // Browser usa o cookie httpOnly; clientes nao-browser usam o token do corpo.
  setAuthCookie(res, token);

  return ok(res, { token, expiresIn: TOKEN_TTL_SECONDS, user: publicUser(user) });
};

// @desc    Encerrar sessao
// @route   POST /api/v1/auth/logout
// @access  Privado
// Nao basta apagar o cookie: o token e revogado pelo jti, senao continuaria valido
// para quem ja o tivesse copiado.
exports.logoutUser = async (req, res) => {
  await revoke(req.token.decoded, 'logout');
  clearAuthCookie(res);

  return noContent(res);
};

// @desc    Renovar o token
// @route   POST /api/v1/auth/refresh
// @access  Privado
// Rotaciona: o token apresentado e revogado e um novo e emitido, para que uma sessao
// renovada nao deixe dois tokens validos circulando.
exports.refreshToken = async (req, res) => {
  await revoke(req.token.decoded, 'refresh');

  const { token } = signToken(req.user);

  setAuthCookie(res, token);

  return ok(res, { token, expiresIn: TOKEN_TTL_SECONDS });
};

// @desc    Trocar a propria senha
// @route   PATCH /api/v1/auth/password
// @access  Privado
// A senha atual e exigida mesmo com a sessao ja autenticada: sem isso, um token roubado
// bastaria para trancar o dono fora da propria conta.
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const confere = await req.user.matchPassword(currentPassword);

  if (!confere) {
    // Mesmo codigo do login errado, de proposito: nao ha o que distinguir aqui.
    throw ApiError.unauthenticated('Senha atual incorreta.', ErrorCode.INVALID_CREDENTIALS);
  }

  req.user.password = newPassword;
  // O pre-save do modelo criptografa. O instante fica gravado para o middleware de
  // autenticacao derrubar toda sessao emitida antes desta linha.
  req.user.passwordChangedAt = new Date();
  await req.user.save();

  // O token que fez esta chamada tambem e anterior a troca — acabou de perder validade.
  // Emitir um novo evita expulsar quem acabou de trocar a propria senha.
  const { token } = signToken(req.user);
  setAuthCookie(res, token);

  return ok(res, { token, expiresIn: TOKEN_TTL_SECONDS });
};

// @desc    Usuario autenticado e suas memberships
// @route   GET /api/v1/auth/me
// @access  Privado
// Substitui o hack de decodificar o JWT no cliente para descobrir quem esta logado.
exports.me = async (req, res) => {
  const memberships = await Membership.find({ user: req.userId })
    .populate('user', 'name username')
    .sort({ joinedAt: 1 });

  return ok(res, { user: publicUser(req.user), memberships });
};

module.exports.publicUser = publicUser;
module.exports.TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
