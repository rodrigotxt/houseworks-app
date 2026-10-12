// app/(app)/panel/page.tsx
// O painel da TV.
//
// Tres decisoes que existem por causa do sofa, e nao do design:
//
//   1. TUDO E GRANDE. A tres metros, um texto de 16px e uma mancha cinza. Os tamanhos aqui
//      sao de 10 pes, nao os do resto do app.
//   2. CADA LINHA E FOCAVEL. Nao ha mouse: a lista se percorre com as setas do controle, e
//      o foco e o que rola a tela. Sem elemento focavel, a seta so rolaria a pagina —
//      funcionaria, mas sem mostrar ONDE se esta.
//   3. O QUE FALTA VEM PRIMEIRO. Atrasadas, depois pendentes, depois concluidas: quem olha
//      o painel de longe quer saber o que ainda nao foi feito, nao o que ja foi.

import type { Metadata } from 'next';
import { headers } from 'next/headers';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import FocoInicial from '@/components/tv/FocoInicial';
import EmptyState from '@/components/ui/EmptyState';
import { formatFullDate, relativeDueLabel, todayInZone } from '@/lib/domain/dates';
import { OCCURRENCE_STATUS_LABELS } from '@/lib/domain/labels';
import { deviceFromUserAgent } from '@/lib/device/profile';
import { requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Painel' };

/** Ordem de leitura do painel: o que esta atrasado incomoda mais do que o que esta feito. */
const PRIORIDADE: Record<string, number> = { overdue: 0, pending: 1, done: 2, skipped: 3 };

export default async function PanelPage() {
  const { householdId } = await requireContext();
  const api = await serverApi();

  const household = await api.households.get(householdId);
  const hoje = todayInZone(household.timezone);

  const { items } = await api.occurrences.list(householdId, { from: hoje, to: hoje, pageSize: 50 });

  const onTv = deviceFromUserAgent((await headers()).get('user-agent')) === 'tv';

  const ordenadas = items.slice().sort((a, b) => {
    const porStatus = (PRIORIDADE[a.status] ?? 9) - (PRIORIDADE[b.status] ?? 9);
    return porStatus !== 0 ? porStatus : a.dueDate.localeCompare(b.dueDate);
  });

  const feitas = items.filter((item) => item.status === 'done').length;
  const atrasadas = items.filter((item) => item.status === 'overdue').length;
  const progresso = items.length === 0 ? 0 : (feitas / items.length) * 100;

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      {items.length > 0 && <FocoInicial seletor="[data-primeiro]" />}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap', mb: 3 }}>
        <Typography variant="h1" component="h1" sx={{ fontSize: '3rem', lineHeight: 1 }}>
          Hoje
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ fontSize: '1.5rem' }}>
          {formatFullDate(hoje)}
        </Typography>
      </Box>

      {items.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mb: 4 }}>
          <Typography sx={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>
            {feitas}
            <Typography component="span" sx={{ fontSize: '2rem', fontWeight: 400, color: 'text.secondary' }}>
              /{items.length}
            </Typography>
          </Typography>

          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            <LinearProgress
              variant="determinate"
              value={progresso}
              sx={{ height: 16, borderRadius: 8, mb: 1 }}
            />
            <Typography variant="h6" color="text.secondary" sx={{ fontSize: '1.25rem' }}>
              {atrasadas > 0
                ? atrasadas + (atrasadas === 1 ? ' atrasada' : ' atrasadas')
                : feitas === items.length
                  ? 'Tudo feito por hoje'
                  : 'concluídas'}
            </Typography>
          </Box>
        </Box>
      )}

      {items.length === 0 ? (
        <EmptyState title="Dia livre" description="Nenhuma tarefa vence hoje nesta casa." />
      ) : (
        <Stack spacing={2.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {ordenadas.map((ocorrencia, indice) => {
            const feita = ocorrencia.status === 'done';
            const atrasada = ocorrencia.status === 'overdue';

            return (
              <Card
                key={ocorrencia.id}
                component="li"
                // Focavel para o controle remoto pousar nela (ver useSpatialNavigation).
                // O anel de foco vem de globals.css, no modo TV.
                tabIndex={0}
                // Marca o primeiro para o FocoInicial acertar o alvo sem depender da
                // ordem do HTML — que pode mudar sem ninguem lembrar deste detalhe.
                data-primeiro={indice === 0 ? 'true' : undefined}
                aria-label={
                  (ocorrencia.task?.name ?? 'Tarefa') +
                  ' — ' +
                  OCCURRENCE_STATUS_LABELS[ocorrencia.status] +
                  (ocorrencia.assignedTo ? ', com ' + ocorrencia.assignedTo.name : ', sem responsável')
                }
                sx={{ opacity: feita ? 0.6 : 1 }}
              >
                <CardContent sx={{ py: 3, '&:last-child': { pb: 3 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography
                        component="h2"
                        sx={{
                          fontSize: '1.9rem',
                          fontWeight: 600,
                          lineHeight: 1.2,
                          textDecoration: feita ? 'line-through' : 'none',
                        }}
                      >
                        {ocorrencia.task?.name ?? 'Tarefa'}
                      </Typography>

                      <Typography sx={{ fontSize: '1.25rem', color: 'text.secondary', mt: 0.5 }}>
                        {ocorrencia.assignedTo ? ocorrencia.assignedTo.name : 'Qualquer um'}
                        {' · '}
                        {relativeDueLabel(ocorrencia.dueDate, hoje)}
                      </Typography>
                    </Box>

                    <Chip
                      color={feita ? 'success' : atrasada ? 'error' : 'default'}
                      variant={feita ? 'filled' : 'outlined'}
                      label={OCCURRENCE_STATUS_LABELS[ocorrencia.status]}
                      sx={{ fontSize: '1.25rem', height: 48, px: 1.5 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {onTv && items.length > 0 && (
        <Typography sx={{ mt: 5, fontSize: '1.125rem', color: 'text.secondary', textAlign: 'center' }}>
          Use as setas do controle remoto para percorrer a lista.
        </Typography>
      )}
    </Container>
  );
}
