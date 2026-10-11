// app/(app)/tasks/[taskId]/page.tsx
// Detalhe da tarefa: tudo o que se sabe sobre ela, e as ações.

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

import PageHeader from '@/components/ui/PageHeader';
import TaskActions from '@/components/tasks/TaskActions';
import { isApiError } from '@/lib/domain/api';
import { DIFFICULTY_LABELS, describeRecurrence } from '@/lib/domain/labels';
import { formatFullDate } from '@/lib/domain/dates';
import { canDeleteTaskForever, canEditTask } from '@/lib/domain/rules';
import { requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Tarefa' };

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 1, flexWrap: 'wrap' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>
        {rotulo}
      </Typography>
      <Box sx={{ flexGrow: 1, minWidth: 200 }}>{children}</Box>
    </Box>
  );
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { membership } = await requireContext();
  const api = await serverApi();

  try {
    const tarefa = await api.tasks.get(taskId);
    const podeEditar = canEditTask(membership);

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <PageHeader
          title={tarefa.name}
          subtitle={tarefa.status === 'archived' ? 'Arquivada' : undefined}
          action={
            podeEditar ? (
              <Button variant="outlined" href={'/tasks/' + taskId + '/edit'}>
                Editar
              </Button>
            ) : undefined
          }
        />

        <Stack spacing={3}>
          <Card>
            <CardContent>
              {tarefa.description && (
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {tarefa.description}
                </Typography>
              )}

              <Divider sx={{ my: 1 }} />

              <Linha rotulo="Frequência">
                <Typography variant="body1">{describeRecurrence(tarefa.recurrence)}</Typography>
              </Linha>

              <Linha rotulo="Começa em">
                <Typography variant="body1">{formatFullDate(tarefa.recurrence.startDate)}</Typography>
              </Linha>

              {tarefa.recurrence.endDate && (
                <Linha rotulo="Termina em">
                  <Typography variant="body1">
                    {formatFullDate(tarefa.recurrence.endDate)}
                  </Typography>
                </Linha>
              )}

              <Linha rotulo="Dificuldade">
                <Chip size="small" variant="outlined" label={DIFFICULTY_LABELS[tarefa.difficulty]} />
              </Linha>

              <Linha rotulo="Vale">
                <Chip size="small" color="primary" label={tarefa.points + ' pontos'} />
              </Linha>

              <Linha rotulo="Quem faz">
                <Typography variant="body1">
                  {tarefa.assignmentStrategy === 'rotate'
                    ? 'Em rodízio entre os membros'
                    : tarefa.assignedTo
                      ? tarefa.assignedTo.name
                      : 'Qualquer um pode assumir'}
                </Typography>
              </Linha>

              <Linha rotulo="Criada por">
                <Typography variant="body2" color="text.secondary">
                  {tarefa.createdBy.name}
                </Typography>
              </Linha>
            </CardContent>
          </Card>

          <TaskActions
            taskId={taskId}
            taskName={tarefa.name}
            archived={tarefa.status === 'archived'}
            canDestroy={canDeleteTaskForever(membership)}
          />
        </Stack>
      </Container>
    );
  } catch (causa) {
    // Uma tarefa de outra casa responde 404 de propósito (a API não confirma que ela
    // existe). Aqui isso vira a página de "não encontrado", que é a verdade para o usuário.
    if (isApiError(causa) && causa.status === 404) notFound();
    throw causa;
  }
}
