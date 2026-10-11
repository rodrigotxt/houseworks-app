// lib/domain/api/resources/auth.ts

import type { Transport } from '../client';
import { unwrap } from '../client';
import type { Envelope, LoginRequest, Membership, RegisterRequest, User } from '../types';

export interface Session {
  user: User;
  memberships: Membership[];
}

export function authResource(transport: Transport) {
  return {
    register(body: RegisterRequest) {
      return transport
        .request<Envelope<{ user: User; household?: unknown }>>('/auth/register', {
          method: 'POST',
          body,
        })
        .then(unwrap);
    },

    /** O cookie httpOnly e gravado pela API; o token no corpo serve a clientes nao-browser. */
    login(body: LoginRequest) {
      return transport
        .request<Envelope<{ token: string; expiresIn: number; user: User }>>('/auth/login', {
          method: 'POST',
          body,
        })
        .then(unwrap);
    },

    /** Revoga o token no servidor e limpa o cookie. */
    logout() {
      return transport.request<void>('/auth/logout', { method: 'POST' });
    },

    /** Rotaciona: o token apresentado e revogado e um novo e emitido. */
    refresh() {
      return transport
        .request<Envelope<{ token: string; expiresIn: number }>>('/auth/refresh', { method: 'POST' })
        .then(unwrap);
    },

    /** Quem sou eu e de quais casas. Substitui decodificar o JWT no cliente. */
    me() {
      return transport.request<Envelope<Session>>('/auth/me').then(unwrap);
    },
  };
}
