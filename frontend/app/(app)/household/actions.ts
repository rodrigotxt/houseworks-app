// app/(app)/household/actions.ts
// As mutacoes de membro e do convite.
//
// DUAS DECISOES QUE VALEM EXPLICACAO:
//
//   1. A CASA VEM DO CONTEXTO, nao do navegador. O householdId e resolvido aqui no servidor,
//      com requireContext, em vez de chegar como argumento -- o cliente diz SOBRE QUEM esta
//      agindo, nunca SOBRE QUAL CASA. Sem isso, um argumento manipulado mandaria a acao para
//      outra casa (a API recusaria, mas o cliente nao deveria nem poder tentar).
//
//   2. saveMember MANDA AS QUATRO CAPACIDADES, mesmo quando o papel ja as define.
//      A API guarda as excecoes como sobreposicoes e o PATCH apenas MESCLA -- nao existe como
//      limpar uma. Como ela tambem nao devolve as sobreposicoes (so o resultado delas), nao ha
//      como saber quais estao gravadas. Mandar so o papel deixaria uma permissao antiga vencer
//      o papel novo, em silencio. Mandar o conjunto inteiro garante que a tela e o servidor
//      digam a mesma coisa. E uma limitacao do contrato, registrada no resumo da entrega.

'use server';

import { revalidatePath } from 'next/cache';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import type { Capability, Role } from '@/lib/domain/rules';
import { requireContext, serverApi } from '@/lib/session/server';

import type { MemberActionState } from '@/components/household/memberState';

function toState(causa: unknown): MemberActionState {
  if (isApiError(causa)) {
    return { status: 'error', message: messageFor(causa.code, causa.message) };
  }

  return { status: 'error', message: 'Nao conseguimos falar com o servidor.' };
}

/** Papel e permissoes de um membro. Exige owner na API. */
export async function saveMember(
  userId: string,
  role: Role,
  capabilities: Record<Capability, boolean>
): Promise<MemberActionState> {
  const { householdId } = await requireContext();

  try {
    await (await serverApi()).households.updateMember(householdId, userId, {
      role,
      capabilities,
    });
  } catch (causa) {
    return toState(causa);
  }

  revalidatePath('/household');
  return { status: 'ok' };
}

/** Remover outro membro. Exige owner -- e a API recusa remover o ultimo owner. */
export async function removeMember(userId: string): Promise<MemberActionState> {
  const { householdId } = await requireContext();

  try {
    await (await serverApi()).households.removeMember(householdId, userId);
  } catch (causa) {
    return toState(causa);
  }

  revalidatePath('/household');
  return { status: 'ok' };
}

/**
 * Sair da casa. Usa o mesmo DELETE, removendo a si mesmo.
 *
 * NAO redireciona daqui. O redirect do Next funciona lancando um erro, e quem chama
 * precisa de um catch para mostrar "voce e o ultimo responsavel" em vez da tela de erro --
 * o catch engoliria o redirect junto. Entao a acao devolve estado e quem navega e o
 * cliente, depois de ler a resposta.
 */
export async function leaveHousehold(): Promise<MemberActionState> {
  const { session, householdId } = await requireContext();

  try {
    await (await serverApi()).households.removeMember(householdId, session.user.id);
  } catch (causa) {
    return toState(causa);
  }

  revalidatePath('/household');
  return { status: 'ok' };
}

/** Gera um codigo de convite novo, invalidando o anterior. Exige owner. */
export async function rotateInvite(): Promise<MemberActionState> {
  const { householdId } = await requireContext();

  try {
    await (await serverApi()).households.rotateInvite(householdId);
  } catch (causa) {
    return toState(causa);
  }

  revalidatePath('/household');
  return { status: 'ok' };
}
