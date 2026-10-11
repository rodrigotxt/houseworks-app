// app/(auth)/login/page.tsx

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import LoginForm from '@/components/auth/LoginForm';
import { getSession } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage() {
  // Já autenticado não precisa ver o formulário.
  if (await getSession()) redirect('/tasks');

  return <LoginForm />;
}
