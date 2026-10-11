// lib/session/household.ts
// Qual casa esta ativa.
//
// O token NAO carrega a casa: um usuario pode pertencer a varias, e o papel dele muda
// em cada uma. Entao "casa atual" e o unico estado de sessao que o cliente gerencia.

import type { Membership } from '@/lib/domain/api/types';

export const HOUSEHOLD_COOKIE = 'hw_household';

/**
 * Resolve a casa ativa entre as memberships do usuario.
 *
 * A ordem importa: a escolha explicita vence; se ela nao existir mais (o usuario saiu da
 * casa, por exemplo), cai para a primeira — nunca devolve uma casa da qual ele nao e
 * membro, e nunca devolve nada quando ele tem pelo menos uma.
 */
export function resolveActiveHousehold(
  memberships: Membership[],
  preferred?: string | null
): Membership | null {
  if (memberships.length === 0) return null;

  if (preferred) {
    const escolhida = memberships.find((membership) => membership.householdId === preferred);
    if (escolhida) return escolhida;
  }

  return memberships[0];
}
