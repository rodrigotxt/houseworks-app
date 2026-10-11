// app/(app)/tasks/new/page.tsx

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';

import PageHeader from '@/components/ui/PageHeader';
import TaskForm from '@/components/tasks/TaskForm';
import { createTask } from '@/app/(app)/tasks/actions';
import { canCreateTask } from '@/lib/domain/rules';
import { findMembership } from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Nova tarefa' };

export default async function NewTaskPage() {
  const { session, membership, householdId } = await requireContext();

  // Esconder o botão não basta: quem chegar pela URL precisa ser barrado aqui também.
  if (!canCreateTask(membership)) redirect('/tasks');

  const api = await serverApi();
  const [household, members] = await Promise.all([
    getHousehold(householdId),
    api.households.listMembers(householdId),
  ]);

  void session;
  void findMembership;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <PageHeader title="Nova tarefa" subtitle="O que precisa ser feito, com que frequência e por quem." />

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
          <Box>
            <TaskForm
              action={createTask.bind(null, householdId)}
              members={members.map((membro) => ({ id: membro.user.id, name: membro.user.name }))}
              timezone={household.timezone}
              submitLabel="Criar tarefa"
              cancelHref="/tasks"
            />
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
