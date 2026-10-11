// app/onboarding/page.tsx
// Quem ainda não participa de nenhuma casa não tem para onde ir. Esta tela existe para
// isso — e fica FORA do grupo (app), porque o shell precisa do nome de uma casa.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import OnboardingForms from '@/components/onboarding/OnboardingForms';
import { requireSession } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Sua casa' };

export default async function OnboardingPage() {
  const session = await requireSession();

  if (session.memberships.length > 0) redirect('/tasks');

  return <OnboardingForms userName={session.user.name} />;
}
