// lib/domain/api/resources/households.ts

import type { Transport } from '../client';
import { unwrap } from '../client';
import type {
  CreateHouseholdRequest,
  Envelope,
  Household,
  InviteCode,
  JoinHouseholdRequest,
  Membership,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
} from '../types';

export function householdsResource(transport: Transport) {
  return {
    list() {
      return transport.request<Envelope<Household[]>>('/households').then(unwrap);
    },

    create(body: CreateHouseholdRequest) {
      return transport
        .request<Envelope<Household>>('/households', { method: 'POST', body })
        .then(unwrap);
    },

    /** Entrar com codigo de convite. */
    join(body: JoinHouseholdRequest) {
      return transport
        .request<Envelope<Membership>>('/households/join', { method: 'POST', body })
        .then(unwrap);
    },

    get(householdId: string) {
      return transport
        .request<Envelope<Household>>('/households/' + householdId)
        .then(unwrap);
    },

    update(householdId: string, body: UpdateHouseholdRequest) {
      return transport
        .request<Envelope<Household>>('/households/' + householdId, { method: 'PATCH', body })
        .then(unwrap);
    },

    /** Exige ?confirm=true — a API recusa remocao acidental. */
    remove(householdId: string) {
      return transport.request<void>('/households/' + householdId, {
        method: 'DELETE',
        query: { confirm: 'true' },
      });
    },

    getInvite(householdId: string) {
      return transport
        .request<Envelope<InviteCode>>('/households/' + householdId + '/invite')
        .then(unwrap);
    },

    rotateInvite(householdId: string) {
      return transport
        .request<Envelope<InviteCode>>('/households/' + householdId + '/invite', { method: 'POST' })
        .then(unwrap);
    },

    listMembers(householdId: string) {
      return transport
        .request<Envelope<Membership[]>>('/households/' + householdId + '/members')
        .then(unwrap);
    },

    updateMember(householdId: string, userId: string, body: UpdateMemberRequest) {
      return transport
        .request<Envelope<Membership>>(
          '/households/' + householdId + '/members/' + userId,
          { method: 'PATCH', body }
        )
        .then(unwrap);
    },

    removeMember(householdId: string, userId: string) {
      return transport.request<void>('/households/' + householdId + '/members/' + userId, {
        method: 'DELETE',
      });
    },
  };
}
