// app/(app)/reminders/page.tsx
// Lembretes: o que já tocou para mim e o que a casa agendou.
//
// A tela tem duas leituras do mesmo recurso, e é bom que sejam distintas:
//
//   - "Agora": notificações que já dispararam e ainda pedem uma ação minha;
//   - "Lembretes": as regras, com o próximo disparo de cada uma.
//
// "Feito" e "Adiar" agem na notificação, não na regra — um remédio diário não deixa de
// existir porque eu tomei o de hoje.

import type { Metadata } from 'next';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import AddIcon from '@mui/icons-material/Add';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import PushToggle from '@/components/reminders/PushToggle';
import ReminderActions from '@/components/reminders/ReminderActions';
import { formatInstant } from '@/lib/domain/dates';
import {
  describeNextFire,
  describeRecipients,
  describeSchedule,
  REMINDER_CHANNEL_LABELS,
  REMINDER_STATUS_LABELS,
} from '@/lib/domain/reminders';
import {
  canEditReminder,
  canManageReminders,
  isReminderRecipient,
} from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Lembretes' };

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string; salvo?: string }>;
}) {
  const { criado, salvo } = await searchParams;
  const { session, membership, householdId } = await requireContext();
  const household = await getHousehold(householdId);
  const api = await serverApi();

  const [lembretesPage, notificacoesPage, push] = await Promise.all([
    api.reminders.list(householdId, { pageSize: 100 }),
    api.notifications.list({ pageSize: 50 }),
    api.push.config(),
  ]);

  const lembretes = lembretesPage.items;
  const notificacoes = notificacoesPage.items;

  const pendentes = notificacoes.filter((notificacao) => !notificacao.acknowledgedAt);
  const pendentesPorLembrete = new Set(pendentes.map((notificacao) => notificacao.reminder.id));
  const naoLidas = notificacoes.filter((notificacao) => !notificacao.readAt).length;

  const podeAdministrar = canManageReminders(membership);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <PageHeader
        title="Lembretes"
        subtitle={
          naoLidas > 0
            ? naoLidas + (naoLidas === 1 ? ' lembrete novo para você' : ' lembretes novos para você')
            : 'Avisos da casa — do remédio das 21h à roupa que já pode lavar.'
        }
        action={
          <Button variant="contained" startIcon={<AddIcon />} href="/reminders/new">
            Novo lembrete
          </Button>
        }
      />

      {criado && <Alert severity="success" sx={{ mb: 3 }}>Lembrete criado.</Alert>}
      {salvo && <Alert severity="success" sx={{ mb: 3 }}>Lembrete atualizado.</Alert>}

      <PushToggle pushEnabled={push.enabled} />

      {pendentes.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" sx={{ fontSize: '1.1rem', mb: 1.5 }}>
            Agora
          </Typography>

          <Stack spacing={1.5}>
            {pendentes.map((notificacao) => (
              <Card key={notificacao.id} sx={{ borderLeft: 4, borderColor: 'primary.main' }}>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <NotificationsActiveIcon fontSize="small" color="primary" />
                        <Typography variant="h6" component="h4" sx={{ fontSize: '1.05rem' }}>
                          {notificacao.reminder.title}
                        </Typography>
                      </Stack>

                      {notificacao.reminder.notes && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {notificacao.reminder.notes}
                        </Typography>
                      )}

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {formatInstant(notificacao.createdAt, household.timezone)}
                        {' · '}
                        {notificacao.reminder.channels
                          .map((canal) => REMINDER_CHANNEL_LABELS[canal])
                          .join(', ')}
                        {' · '}
                        <Box component="a" href={'/reminders/' + notificacao.reminder.id} sx={{ color: 'inherit' }}>
                          ver lembrete
                        </Box>
                      </Typography>
                    </Box>

                    <ReminderActions
                      reminderId={notificacao.reminder.id}
                      status={notificacao.reminder.status}
                      canEdit={podeAdministrar}
                      isRecipient
                      hasPending={!notificacao.acknowledgedAt}
                    />
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Divider sx={{ mt: 4 }} />
        </Box>
      )}

      <Typography variant="h3" sx={{ fontSize: '1.1rem', mb: 1.5 }}>
        Lembretes da casa
      </Typography>

      {lembretes.length === 0 ? (
        <EmptyState
          title="Nenhum lembrete ainda"
          description="Crie um aviso para a casa: um remédio, a roupa que já pode lavar, uma tarefa para conferir."
          actionLabel="Criar o primeiro"
          actionHref="/reminders/new"
        />
      ) : (
        <Stack spacing={1.5}>
          {lembretes.map((lembrete) => {
            const proximo = describeNextFire(lembrete.nextFireAt, household.timezone);

            return (
              <Card key={lembrete.id}>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Box sx={{ flexGrow: 1, minWidth: 220 }}>
                      <Typography variant="h6" component="h4" sx={{ fontSize: '1.05rem' }}>
                        {lembrete.title}
                      </Typography>

                      {lembrete.notes && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {lembrete.notes}
                        </Typography>
                      )}

                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}
                        useFlexGap
                      >
                        <Chip size="small" variant="outlined" label={describeSchedule(lembrete.schedule)} />
                        {proximo && <Chip size="small" color="primary" label={proximo} />}
                        <Chip size="small" variant="outlined" label={describeRecipients(lembrete)} />

                        {lembrete.channels
                          .filter((canal) => canal !== 'in_app')
                          .map((canal) => (
                            <Chip key={canal} size="small" label={REMINDER_CHANNEL_LABELS[canal]} />
                          ))}

                        {lembrete.task && (
                          <Chip size="small" label={'Tarefa: ' + lembrete.task.name} />
                        )}

                        {lembrete.status !== 'active' && (
                          <Chip
                            size="small"
                            color="warning"
                            label={REMINDER_STATUS_LABELS[lembrete.status]}
                          />
                        )}
                      </Stack>
                    </Box>

                    <ReminderActions
                      reminderId={lembrete.id}
                      status={lembrete.status}
                      canEdit={canEditReminder(membership, lembrete, session.user.id)}
                      isRecipient={isReminderRecipient(lembrete, session.user.id)}
                      hasPending={pendentesPorLembrete.has(lembrete.id)}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Container>
  );
}
