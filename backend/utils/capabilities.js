// utils/capabilities.js
// Papeis e o que cada um pode fazer. Fonte unica da autorizacao por capacidade.
//
// A Membership guarda o papel e, opcionalmente, sobreposicoes pontuais (overrides).
// As capacidades efetivas sao SEMPRE calculadas a partir dos dois — nunca lidas de um
// campo gravado, para nao existir estado divergente.

const ROLES = ['owner', 'adult', 'child'];

const ROLE_CAPABILITIES = {
  owner: {
    canAssign: true,
    canRate: true,
    canManageTasks: true,
    canManageMembers: true,
    canManageReminders: true,
  },
  adult: {
    canAssign: true,
    canRate: true,
    canManageTasks: true,
    canManageMembers: false,
    canManageReminders: true,
  },
  child: {
    canAssign: false,
    canRate: false,
    canManageTasks: false,
    canManageMembers: false,
    canManageReminders: false,
  },
};

const CAPABILITY_NAMES = [
  'canAssign',
  'canRate',
  'canManageTasks',
  'canManageMembers',
  'canManageReminders',
];

// Capacidades efetivas = padrao do papel + sobreposicoes.
function resolveCapabilities(role, overrides) {
  const base = ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.child;
  const resolved = Object.assign({}, base);

  if (overrides) {
    CAPABILITY_NAMES.forEach((name) => {
      if (typeof overrides[name] === 'boolean') {
        resolved[name] = overrides[name];
      }
    });
  }

  return resolved;
}

module.exports = {
  ROLES,
  CAPABILITY_NAMES,
  ROLE_CAPABILITIES,
  resolveCapabilities,
};
