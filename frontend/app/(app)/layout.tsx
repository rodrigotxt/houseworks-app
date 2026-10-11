// app/(app)/layout.tsx
// O layout das telas autenticadas.
//
// A autorização acontece AQUI, no servidor, com a resposta real da API — e não no
// middleware olhando se existe um cookie. É uma verificação de verdade: se a sessão
// acabou (ou o usuário foi removido), requireContext manda para o login.

import { headers } from 'next/headers';

import AppShell from '@/components/shells/AppShell';
import { deviceFromUserAgent } from '@/lib/device/profile';
import { getHousehold, requireContext } from '@/lib/session/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, householdId } = await requireContext();

  const household = await getHousehold(householdId);
  const userAgent = (await headers()).get('user-agent');

  return (
    <AppShell
      device={deviceFromUserAgent(userAgent)}
      householdName={household.name}
      userName={session.user.name}
      username={session.user.username}
    >
      {children}
    </AppShell>
  );
}
