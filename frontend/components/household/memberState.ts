// components/household/memberState.ts
// O estado das acoes de membro.
//
// Mora FORA de actions.ts de proposito: um arquivo com 'use server' so pode exportar
// funcoes assincronas, e uma constante exportada ali quebra o build.

export interface MemberActionState {
  status: 'idle' | 'ok' | 'error';
  message?: string;
}

export const EMPTY_MEMBER_ACTION: MemberActionState = { status: 'idle' };
