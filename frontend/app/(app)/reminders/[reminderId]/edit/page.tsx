// app/(app)/reminders/[reminderId]/edit/page.tsx
// Editar lembrete.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import Container from '@mui/material/Container';

import PageHeader from '@/components/ui/PageHeader';
import ReminderForm from '@/components/reminders/ReminderForm';
import { isApiError } from '@/lib/domain/api';
import type { Reminder } from '@/lib/domain/api/types';
import { canEditReminder, canManageReminders } from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';
import { updateReminder } from '../../actions';
import { loadReminderFormOptions } from '../../data';

export const metadata: Metadata = { title: 'Editar lembrete' };

export default async function EditReminderPage({
  params,
}: {
  params: Promise<{ reminderId: string }>;
}) {
  const { reminderId } = await params;
  const { session, membership, householdId } = await requireContext();
  const household = await getHousehold(householdId);
  const api = await serverApi();

  let lembrete: Reminder;

  try {
    lembrete = await api.reminders.get(reminderId);
  } catch (causa) {
    if (isApiError(causa) && causa.status === 404) notFound();
    throw causa;
  }

  if (!canEditReminder(membership, lembrete, session.user.id)) {
    redirect('/reminders/' + reminderId);
  }

  const opcoes = await loadReminderFormOptions(householdId);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <PageHeader title="Editar lembrete" subtitle={lembrete.title} />

      <ReminderForm
        action={updateReminder.bind(null, reminderId)}
        timezone={household.timezone}
        reminder={lembrete}
        canManage={canManageReminders(membership)}
        currentUserId={session.user.id}
        submitLabel="Salvar"
        cancelHref={'/reminders/' + reminderId}
        {...opcoes}
      />
    </Container>
  );
}
