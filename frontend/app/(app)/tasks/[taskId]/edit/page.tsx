// app/(app)/tasks/[taskId]/edit/page.tsx

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';

import PageHeader from '@/components/ui/PageHeader';
import TaskForm from '@/components/tasks/TaskForm';
import { updateTask } from '@/app/(app)/tasks/actions';
import { isApiError } from '@/lib/domain/api';
import { canEditTask } from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Editar tarefa' };

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { membership, householdId } = await requireContext();

  if (!canEditTask(membership)) redirect('/tasks/' + taskId);

  const api = await serverApi();

  try {
    const [tarefa, household, members] = await Promise.all([
      api.tasks.get(taskId),
      getHousehold(householdId),
      api.households.listMembers(householdId),
    ]);

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <PageHeader
          title="Editar tarefa"
          subtitle="Mudar a frequência não reescreve o passado: o que já foi feito fica como está."
        />

        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <TaskForm
              action={updateTask.bind(null, taskId)}
              members={members.map((membro) => ({ id: membro.user.id, name: membro.user.name }))}
              timezone={household.timezone}
              task={tarefa}
              submitLabel="Salvar alterações"
              cancelHref={'/tasks/' + taskId}
            />
          </CardContent>
        </Card>
      </Container>
    );
  } catch (causa) {
    if (isApiError(causa) && causa.status === 404) notFound();
    throw causa;
  }
}
