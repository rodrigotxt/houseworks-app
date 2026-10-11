// app/(app)/panel/page.tsx
// O painel da TV.
//
// Existe dentro do grupo (app) para reaproveitar o shell, mas quem for de TV cai direto
// nele. Ele e o unico destino do icone de TV na barra superior.

import type { Metadata } from 'next';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import EmptyState from '@/components/ui/EmptyState';
import { OCCURRENCE_STATUS_LABELS } from '@/lib/domain/labels';
import { relativeDueLabel, todayInZone } from '@/lib/domain/dates';
import { requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Painel' };

export default async function PanelPage() {
  const { householdId } = await requireContext();
  const api = await serverApi();

  const household = await api.households.get(householdId);
  const hoje = todayInZone(household.timezone);

  const { items } = await api.occurrences.list(householdId, { from: hoje, to: hoje, pageSize: 50 });

  const feitas = items.filter((item) => item.status === 'done').length;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h2" gutterBottom>
        Hoje
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        {items.length === 0
          ? 'Nada agendado para hoje.'
          : feitas + ' de ' + items.length + ' concluídas'}
      </Typography>

      {items.length === 0 ? (
        <EmptyState title="Dia livre" description="Nenhuma tarefa vence hoje nesta casa." />
      ) : (
        <Stack spacing={2}>
          {items.map((ocorrencia) => (
            <Card key={ocorrencia.id}>
              <CardContent sx={{ py: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="h4" component="h3" sx={{ fontSize: '1.75rem' }}>
                      {ocorrencia.task?.name ?? 'Tarefa'}
                    </Typography>
                    <Typography variant="h6" color="text.secondary">
                      {ocorrencia.assignedTo ? ocorrencia.assignedTo.name : 'Qualquer um'}
                      {' · '}
                      {relativeDueLabel(ocorrencia.dueDate, hoje)}
                    </Typography>
                  </Box>

                  <Chip
                    size="medium"
                    color={ocorrencia.status === 'done' ? 'success' : ocorrencia.status === 'overdue' ? 'error' : 'default'}
                    label={OCCURRENCE_STATUS_LABELS[ocorrencia.status]}
                    sx={{ fontSize: '1rem', py: 2.5, px: 1 }}
                  />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
