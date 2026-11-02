// app/page.tsx
// A porta de entrada só decide para onde mandar.

import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session/server';

export default async function Home() {
  const session = await getSession();

  // A página inicial do produto é o CRONOGRAMA (a agenda do dia): é o que a família abre
  // para ver o que vence e marcar o que fez. Quem não tem sessão vai para o login; quem
  // ainda não tem casa é desviado para o onboarding pelo próprio layout de (app).
  redirect(session ? '/schedule' : '/login');
}
