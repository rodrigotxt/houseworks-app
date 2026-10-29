// app/(app)/reminders/new/page.tsx
// Criar lembrete.

import type { Metadata } from 'next';

import Container from '@mui/material/Container';

import PageHeader from '@/components/ui/PageHeader';
import ReminderForm from '@/components/reminders/ReminderForm';
import { canManageReminders } from '@/lib/domain/rules';
import { getHousehold, requireContext } from '@/lib/session/server';
import { createReminder } from '../actions';
import { loadReminderFormOptions } from '../data';

export const metadata: Metadata = { title: 'Novo lembrete' };

export default async function NewReminderPage() {
  const { session, membership, householdId } = await requireContext();
  const household = await getHousehold(householdId);
  const opcoes = await loadReminderFormOptions(householdId);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <PageHeader
        title="Novo lembrete"
        subtitle="Um aviso para você ou para a casa, no dia e na hora que fizer sentido."
      />

      <ReminderForm
        action={createReminder}
        timezone={household.timezone}
        reminder={null}
        canManage={canManageReminders(membership)}
        currentUserId={session.user.id}
        submitLabel="Criar lembrete"
        cancelHref="/reminders"
        {...opcoes}
      />
    </Container>
  );
}
