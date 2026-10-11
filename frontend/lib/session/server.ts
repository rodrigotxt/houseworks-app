// lib/session/server.ts
// Acesso a API a partir do SERVIDOR (Server Components, layouts, Server Actions).
//
// Duas coisas que so existem aqui e que sao faceis de errar:
//
//   1. O cookie NAO viaja sozinho num fetch do servidor. Precisa ser lido e repassado.
//   2. O endereco e DIFERENTE do que o browser usa: dentro do Docker, o servidor alcanca
//      a API por http://backend:3000 (nome do servico); o browser, por localhost:3001.

import { cache } from 'react';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ApiError, createApiClient, type ApiClient } from '@/lib/domain/api';
import type { Membership } from '@/lib/domain/api/types';
import { PUBLIC_API_URL } from './config';
import { HOUSEHOLD_COOKIE, resolveActiveHousehold } from './household';

export const INTERNAL_API_URL = process.env.API_INTERNAL_URL || PUBLIC_API_URL;

/**
 * `cache` do React: dentro de UMA requisicao, a funcao roda uma vez so e o resultado e
 * reaproveitado por todo mundo que a chamar — o layout, a pagina, qualquer componente.
 *
 * Sem isto, o layout e cada pagina chamavam /auth/me separadamente: cada navegacao fazia
 * duas vezes a mesma pergunta, em serie, antes de comecar a buscar o que interessava.
 */
export const serverApi = cache(async (): Promise<ApiClient> => {
  const jar = await cookies();

  return createApiClient({
    baseUrl: INTERNAL_API_URL,
    // Repassa a sessao adiante. Sem isto toda chamada do servidor chega anonima.
    cookie: jar.toString(),
  });
});

export interface Session {
  user: { id: string; name: string; username: string; email: string };
  memberships: Membership[];
}

/** A sessao atual, ou null se nao houver. Erro de rede NAO vira "sem sessao". */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    return await (await serverApi()).auth.me();
  } catch (error) {
    if (error instanceof ApiError && error.isSessionExpired) return null;
    // API fora do ar nao e "usuario deslogado": seria mentira mandar para o login.
    throw error;
  }
});

export const requireSession = cache(async (): Promise<Session> => {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
});

/** A casa ativa. Cacheada: o layout e a pagina pedem a mesma coisa na mesma requisicao. */
export const getHousehold = cache(async (householdId: string) => {
  return (await serverApi()).households.get(householdId);
});

export interface ActiveContext {
  session: Session;
  membership: Membership;
  householdId: string;
}

/**
 * Requer sessao E uma casa ativa. Sem casa, manda para o onboarding — nunca renderiza uma
 * tela de dados sem saber de qual casa ela e.
 */
export const requireContext = cache(async (): Promise<ActiveContext> => {
  const session = await requireSession();
  const jar = await cookies();

  const membership = resolveActiveHousehold(
    session.memberships,
    jar.get(HOUSEHOLD_COOKIE)?.value
  );

  if (!membership) redirect('/onboarding');

  return { session, membership, householdId: membership.householdId };
});
