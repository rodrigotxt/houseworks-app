// app/(app)/reminders/[reminderId]/page.tsx
// Detalhe do lembrete: a regra, o próximo disparo e o que já tocou para mim.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import PageHeader from '@/components/ui/PageHeader';
import ReminderActions from '@/components/reminders/ReminderActions';
import { formatInstant } from '@/lib/domain/dates';
import {
  describeNextFire,
  describeRecipients,
  describeSchedule,
  REMINDER_CHANNEL_LABELS,
  REMINDER_STATUS_LABELS,
} from '@/lib/domain/reminders';
import { isApiError } from '@/lib/domain/api';
import type { Reminder } from '@/lib/domain/api/types';
import {
  canEditReminder,
  isReminderRecipient,
} from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Lembrete' };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 1, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {rotulo}
      </Typography>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export default async function ReminderDetailPage({
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

  const proximo = describeNextFire(lembrete.nextFireAt, household.timezone);
  const entrega = lembrete.myDelivery;
  const podeEditar = canEditReminder(membership, lembrete, session.user.id);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Button href="/reminders" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 2 }}>
        Lembretes
      </Button>

      <PageHeader
        title={lembrete.title}
        subtitle={describeSchedule(lembrete.schedule)}
        action={
          <Chip
            label={REMINDER_STATUS_LABELS[lembrete.status]}
            color={lembrete.status === 'active' ? 'success' : 'default'}
          />
        }
      />

      {lembrete.notes && (
        <Typography variant="body1" sx={{ mb: 3 }}>
          {lembrete.notes}
        </Typography>
      )}

      <Card variant="outlined">
        <CardContent>
          <Linha rotulo="Próximo aviso">
            <Typography variant="body2">{proximo ?? 'Nenhum disparo previsto'}</Typography>
          </Linha>

          <Divider />

          <Linha rotulo="Quem recebe">
            <Typography variant="body2">{describeRecipients(lembrete)}</Typography>
          </Linha>

          <Divider />

          <Linha rotulo="Como avisa">
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {lembrete.channels.map((canal) => (
                <Chip key={canal} size="small" label={REMINDER_CHANNEL_LABELS[canal]} />
              ))}
            </Stack>
          </Linha>

          {lembrete.task && (
            <>
              <Divider />
              <Linha rotulo="Tarefa vinculada">
                <Typography variant="body2">
                  {lembrete.task.name}
                  {lembrete.skipIfTaskDone
                    ? ' — não avisa se ela já estiver feita no dia.'
                    : ''}
                </Typography>
              </Linha>
            </>
          )}

          <Divider />

          <Linha rotulo="Criado por">
            <Typography variant="body2">{lembrete.createdBy.name}</Typography>
          </Linha>

          <Divider />

          <Linha rotulo="Minha última notificação">
            {entrega ? (
              <Typography variant="body2">
                {formatInstant(entrega.createdAt, household.timezone)}
                {entrega.acknowledgedAt
                  ? ' · marcada como feita'
                  : entrega.readAt
                    ? ' · lida'
                    : ' · não lida'}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Nenhuma ainda
              </Typography>
            )}
          </Linha>
        </CardContent>
      </Card>

      <Box sx={{ mt: 3 }}>
        <ReminderActions
          reminderId={lembrete.id}
          status={lembrete.status}
          canEdit={podeEditar}
          isRecipient={isReminderRecipient(lembrete, session.user.id)}
          hasPending={Boolean(entrega && !entrega.acknowledgedAt)}
        />
      </Box>
    </Container>
  );
}
