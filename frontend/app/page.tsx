// app/page.tsx
// A porta de entrada só decide para onde mandar.

import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session/server';

export default async function Home() {
  const session = await getSession();
  redirect(session ? '/tasks' : '/login');
}
