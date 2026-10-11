// controllers/householdController.js
// Casas, convites e membros.
// As rotas de :householdId chegam aqui ja com req.household e req.membership resolvidos
// pelos middlewares de membership — o controller nao repete checagem de acesso.

const Household = require('../models/Household');
const Membership = require('../models/Membership');
const Task = require('../models/Task');
const TaskExecution = require('../models/TaskExecution');
const ApiError = require('../utils/apiError');
const ErrorCode = require('../utils/errorCodes');
const { ok, created, noContent } = require('../utils/respond');
const { generateInviteCode, inviteExpiry } = require('../utils/inviteCode');

// A casa nao pode ficar sem owner: sem isso ninguem consegue administra-la.
async function ensureNotLastOwner(householdId) {
  const owners = await Membership.countDocuments({ household: householdId, role: 'owner' });

  if (owners <= 1) {
    throw ApiError.conflict(
      'A casa precisa de pelo menos um owner.',
      ErrorCode.LAST_OWNER_CANNOT_LEAVE
    );
  }
}

// @desc    Criar casa (o criador vira owner)
// @route   POST /api/v1/households
// @access  Privado
exports.create = async (req, res) => {
  const { name, timezone, ratingWindowHours, horizonDays } = req.body;

  const household = await new Household({
    name,
    timezone,
    ratingWindowHours,
    horizonDays,
    ownerId: req.userId,
    inviteCode: generateInviteCode(),
    inviteCodeExpiresAt: inviteExpiry(),
  }).save();

  await new Membership({
    user: req.userId,
    household: household._id,
    role: 'owner',
  }).save();

  return created(res, household);
};

// @desc    Minhas casas
// @route   GET /api/v1/households
// @access  Privado
exports.listMine = async (req, res) => {
  const memberships = await Membership.find({ user: req.userId }).populate('household');
  const households = memberships.map((membership) => membership.household).filter(Boolean);

  return ok(res, households);
};

// @desc    Entrar em uma casa com codigo de convite
// @route   POST /api/v1/households/join
// @access  Privado
exports.join = async (req, res) => {
  const { inviteCode, role } = req.body;

  const household = await Household.findOne({ inviteCode: inviteCode.trim().toUpperCase() })
    .select('+inviteCode +inviteCodeExpiresAt');

  const expired =
    household &&
    household.inviteCodeExpiresAt &&
    household.inviteCodeExpiresAt.getTime() < Date.now();

  if (!household || expired) {
    throw ApiError.forbidden(
      'Codigo de convite invalido ou expirado.',
      ErrorCode.INVITE_CODE_INVALID
    );
  }

  const alreadyMember = await Membership.findOne({
    household: household._id,
    user: req.userId,
  });

  if (alreadyMember) {
    throw ApiError.conflict('Voce ja e membro desta casa.', ErrorCode.DUPLICATE_MEMBER);
  }

  const membership = await new Membership({
    user: req.userId,
    household: household._id,
    role: role || 'child',
  }).save();

  await membership.populate('user', 'name username');

  return created(res, membership);
};

// @desc    Detalhe da casa
// @route   GET /api/v1/households/:householdId
// @access  Membro da casa
exports.get = async (req, res) => {
  return ok(res, req.household);
};

// @desc    Atualizar a casa
// @route   PATCH /api/v1/households/:householdId
// @access  Owner
exports.update = async (req, res) => {
  const { name, timezone, ratingWindowHours, horizonDays } = req.body;

  if (name !== undefined) req.household.name = name;
  if (timezone !== undefined) req.household.timezone = timezone;
  if (ratingWindowHours !== undefined) req.household.ratingWindowHours = ratingWindowHours;
  if (horizonDays !== undefined) req.household.horizonDays = horizonDays;

  await req.household.save();

  return ok(res, req.household);
};

// @desc    Remover a casa (cascata)
// @route   DELETE /api/v1/households/:householdId
// @access  Owner
exports.remove = async (req, res) => {
  if (req.query.confirm !== 'true') {
    throw ApiError.badRequest('Confirme a remocao da casa.', [
      { field: 'confirm', issue: 'Informe ?confirm=true para remover a casa.' },
    ]);
  }

  const householdId = req.household._id;

  // Cascata completa. Apagar so a casa deixaria tarefas e execucoes orfas,
  // visiveis para ninguem e ocupando indice.
  await Promise.all([
    Membership.deleteMany({ household: householdId }),
    Task.deleteMany({ household: householdId }),
    TaskExecution.deleteMany({ household: householdId }),
  ]);
  await Household.deleteOne({ _id: householdId });

  return noContent(res);
};

// @desc    Consultar o codigo de convite
// @route   GET /api/v1/households/:householdId/invite
// @access  Owner ou adult
exports.getInvite = async (req, res) => {
  const household = await Household.findById(req.household._id)
    .select('+inviteCode +inviteCodeExpiresAt');

  return ok(res, { code: household.inviteCode, expiresAt: household.inviteCodeExpiresAt });
};

// @desc    Rotacionar o codigo de convite
// @route   POST /api/v1/households/:householdId/invite
// @access  Owner
exports.rotateInvite = async (req, res) => {
  const household = await Household.findById(req.household._id)
    .select('+inviteCode +inviteCodeExpiresAt');

  household.inviteCode = generateInviteCode();
  household.inviteCodeExpiresAt = inviteExpiry();
  await household.save();

  return ok(res, { code: household.inviteCode, expiresAt: household.inviteCodeExpiresAt });
};

// @desc    Membros da casa
// @route   GET /api/v1/households/:householdId/members
// @access  Membro da casa
exports.listMembers = async (req, res) => {
  const memberships = await Membership.find({ household: req.household._id })
    .populate('user', 'name username')
    .sort({ joinedAt: 1 });

  return ok(res, memberships);
};

// @desc    Alterar papel ou capacidades de um membro
// @route   PATCH /api/v1/households/:householdId/members/:userId
// @access  Owner
exports.updateMember = async (req, res) => {
  const { role, capabilities } = req.body;

  const membership = await Membership.findOne({
    household: req.household._id,
    user: req.params.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Membro nao encontrado.', ErrorCode.MEMBER_NOT_FOUND);
  }

  // Rebaixar o ultimo owner deixaria a casa sem administrador.
  if (role && role !== 'owner' && membership.role === 'owner') {
    await ensureNotLastOwner(req.household._id);
  }

  if (role) {
    membership.role = role;
  }

  if (capabilities) {
    membership.set('overrides', Object.assign({}, membership.overrides, capabilities));
  }

  await membership.save();
  await membership.populate('user', 'name username');

  return ok(res, membership);
};

// @desc    Remover membro (um owner remove qualquer um; qualquer um remove a si mesmo)
// @route   DELETE /api/v1/households/:householdId/members/:userId
// @access  Membro da casa
exports.removeMember = async (req, res) => {
  const membership = await Membership.findOne({
    household: req.household._id,
    user: req.params.userId,
  });

  if (!membership) {
    throw ApiError.notFound('Membro nao encontrado.', ErrorCode.MEMBER_NOT_FOUND);
  }

  const isSelf = String(membership.user) === req.userId;

  if (!isSelf && req.membership.role !== 'owner') {
    throw ApiError.forbidden(
      'Apenas um owner pode remover outro membro.',
      ErrorCode.INSUFFICIENT_ROLE
    );
  }

  if (membership.role === 'owner') {
    await ensureNotLastOwner(req.household._id);
  }

  await Membership.deleteOne({ _id: membership._id });

  return noContent(res);
};
