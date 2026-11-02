// app/(app)/review/page.tsx
// CONFERIR — a fila de avaliação.
//
// O ciclo do produto só fecha quando OUTRO membro dá a nota. Esta é a tela dessa
// conferência: o que já foi feito, por quem, com que comentário e quanto tempo levou.
//
// Quem executou nunca aparece na própria fila — a API já filtra, e a regra é repetida
// aqui na cópia das capacidades. A nota é obrigatória (1–5) e o comentário é opcional.
//
// Se ninguém avaliar dentro de Household.ratingWindowHours (72 h por padrão), a execução
// é auto-aprovada: ninguém fica preso a um avaliador ausente.

import type { Metadata } from 'next';
import NextLink from 'next/link';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import ReviewActions from '@/components/review/ReviewActions';
import type { TaskExecution } from '@/lib/domain/api/types';
import { formatInstant } from '@/lib/domain/dates';
import { formatDuration } from '@/lib/domain/format';
import {
  canRateExecution,
  hasCapability,
  ratingDeadline,
} from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Conferir' };

/** Tempo real, estimado, ou os dois — sem inventar um quando o outro falta. */
function descreverTempo(execution: TaskExecution): string | null {
  const real = execution.actualMinutes;
  const estimado = execution.estimatedMinutes;

  if (real != null && estimado != null) {
    return formatDuration(real) + ' reais · ' + formatDuration(estimado) + ' estimados';
  }

  if (real != null) return formatDuration(real) + ' reais';
  if (estimado != null) return formatDuration(estimado) + ' estimados';

  return null;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: paginaParam } = await searchParams;
  const pagina = Math.max(1, Number(paginaParam) || 1);

  const { session, membership, householdId } = await requireContext();
  const household = await getHousehold(householdId);
  const api = await serverApi();

  const podeAvaliar = hasCapability(membership, 'canRate');

  if (!podeAvaliar) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <PageHeader title="Conferir" subtitle="A fila de avaliação da casa" />

        <EmptyState
          title="Seu papel não confere tarefas"
          description="Quem dá a nota são owners e adultos. Você continua acompanhando seu próprio desempenho no placar."
          actionLabel="Ver desempenho"
          actionHref="/performance"
        />
      </Container>
    );
  }

  const fila = await api.executions.list(householdId, {
    pendingReviewForMe: true,
    page: pagina,
    pageSize: 20,
  });

  const total = fila.meta.total;
  const totalPages = fila.meta.totalPages;

  const subtitulo =
    total === 0
      ? 'Nada esperando sua nota'
      : total === 1
        ? '1 execução esperando sua nota'
        : total + ' execuções esperando sua nota';

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <PageHeader title="Conferir" subtitle={subtitulo} />

      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
        Você confere o que <strong>outro membro</strong> fez — a própria execução nunca aparece
        aqui. Sem avaliação em {household.ratingWindowHours}h, o sistema aprova automaticamente.
      </Alert>

      {total === 0 ? (
        <EmptyState
          title="Nada para conferir"
          description="Quando alguém concluir uma tarefa que não é sua, ela aparece aqui para você dar a nota."
          actionLabel="Ver agenda"
          actionHref="/schedule"
        />
      ) : (
        <Stack spacing={1.5}>
          {fila.items.map((execution) => {
            const prazo = ratingDeadline(household, execution).toISOString();
            const tempo = descreverTempo(execution);
            const disponivel = canRateExecution(
              execution,
              household,
              membership,
              session.user.id
            );

            return (
              <Card key={execution.id}>
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
                      <Typography variant="h6" component="h3" sx={{ fontSize: '1.05rem' }}>
                        <Link
                          component={NextLink}
                          href={'/tasks/' + execution.taskId}
                          underline="hover"
                          color="inherit"
                        >
                          {execution.task?.name ?? 'Tarefa'}
                        </Link>
                      </Typography>

                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          Feito por {execution.executedBy.name}
                        </Typography>

                        <Chip
                          size="small"
                          label={formatInstant(execution.completionDate, household.timezone)}
                        />

                        <Chip
                          size="small"
                          variant="outlined"
                          label={execution.points + (execution.points === 1 ? ' ponto' : ' pontos')}
                        />

                        <Chip
                          size="small"
                          variant="outlined"
                          color="warning"
                          label={'Avaliar até ' + formatInstant(prazo, household.timezone)}
                        />
                      </Stack>

                      {execution.note && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1, fontStyle: 'italic' }}
                        >
                          “{execution.note}”
                        </Typography>
                      )}

                      {tempo && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Tempo: {tempo}
                        </Typography>
                      )}
                    </Box>

                    {disponivel && (
                      <ReviewActions
                        executionId={execution.id}
                        taskName={execution.task?.name ?? 'Tarefa'}
                        executedByName={execution.executedBy.name}
                      />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {totalPages > 1 && (
        <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: 'center', alignItems: 'center' }}>
          {pagina > 1 && (
            <Button href={'/review?page=' + (pagina - 1)} color="inherit">
              Anterior
            </Button>
          )}

          <Typography variant="body2" color="text.secondary">
            Página {pagina} de {totalPages}
          </Typography>

          {pagina < totalPages && (
            <Button href={'/review?page=' + (pagina + 1)} color="inherit">
              Próxima
            </Button>
          )}
        </Stack>
      )}
    </Container>
  );
}
