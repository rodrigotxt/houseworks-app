// app/(auth)/register/page.tsx
// Criar conta. E a porta que faltava: sem ela, quem nao tinha conta nao tinha por onde
// entrar — o /onboarding, onde o codigo de convite aparece, exige sessao.
//
// O cadastro daqui cria SO a conta, sem casa. A casa vem depois, no onboarding: criar uma
// nova ou entrar na de alguem com o codigo.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import RegisterForm from '@/components/auth/RegisterForm';
import { getSession } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  // Quem ja esta dentro nao precisa criar conta.
  if (await getSession()) redirect('/tasks');

  return <RegisterForm />;
}
