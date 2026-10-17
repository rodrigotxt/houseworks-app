// app/(app)/schedule/page.tsx
// A agenda: o que vence em cada dia.
//
// É a tela de uso diário — a família abre, vê o que é de quem e marca o que fez. Por isso
// ela é organizada por DIA e abre na semana corrente, com a semana começando no domingo,
// igual à convenção da recorrência na API.

import type { Metadata } from 'next';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import OccurrenceActions from '@/components/schedule/OccurrenceActions';
import type { Page, TaskOccurrence } from '@/lib/domain/api/types';
import { OCCURRENCE_STATUS_LABELS } from '@/lib/domain/labels';
import { addDays, formatDayAndMonth, relativeDueLabel, todayInZone, weekdayOf } from '@/lib/domain/dates';
import { cargasDoDia, type MembroComTempoLivre } from '@/lib/domain/freeTime';
import { formatDuration } from '@/lib/domain/format';
import {
  canComplete,
  canSkip,
  canUndoOccurrence,
  completionProgress,
} from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Cronograma' };

const ESCOPOS = ['casa', 'minhas'] as const;
type Escopo = (typeof ESCOPOS)[number];

/** Domingo da semana que contém a data. */
function inicioDaSemana(data: string): string {
  return addDays(data, -weekdayOf(data));
}

/**
 * O contrato limita pageSize a 100. Uma semana com mais ocorrências que isso não pode ser
 * truncada em silêncio — a agenda mostraria menos do que existe e ninguém perceberia.
 * Então buscamos as páginas restantes e juntamos.
 */
async function todasAsOcorrencias(
  buscar: (pagina: number) => Promise<Page<TaskOccurrence>>
): Promise<TaskOccurrence[]> {
  const primeira = await buscar(1);

  if (primeira.meta.totalPages <= 1) return primeira.items;

  const restantes = await Promise.all(
    Array.from({ length: primeira.meta.totalPages - 1 }, (_, indice) => buscar(indice + 2))
  );

  return [...primeira.items, ...restantes.flatMap((pagina) => pagina.items)];
}

const CORES: Record<TaskOccurrence['status'], 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'default',
  done: 'success',
  overdue: 'error',
  skipped: 'warning',
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; escopo?: string }>;
}) {
  const { from, escopo: escopoParam } = await searchParams;
  const escopo: Escopo = escopoParam === 'minhas' ? 'minhas' : 'casa';

  const { session, membership, householdId } = await requireContext();
  const api = await serverApi();

  const household = await getHousehold(householdId);
  const hoje = todayInZone(household.timezone);

  const inicio = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : inicioDaSemana(hoje);
  const fim = addDays(inicio, 6);

  // Os membros entram por causa do tempo livre: o aviso de carga e por pessoa. Nao chega
  // a ser um N+1 — e uma chamada por tela, nao por ocorrencia.
  const membrosDaCasa = await api.households.listMembers(householdId);

  const items = await todasAsOcorrencias((pagina) =>
    escopo === 'minhas'
      ? api.occurrences.listMine({ from: inicio, to: fim, householdId, pageSize: 100, page: pagina })
      : api.occurrences.list(householdId, { from: inicio, to: fim, pageSize: 100, page: pagina })
  );

  // Agrupa por dia preservando a ordem cronológica que a API já devolveu.
  const porDia = new Map<string, TaskOccurrence[]>();
  for (const ocorrencia of items) {
    const doDia = porDia.get(ocorrencia.dueDate) ?? [];
    doDia.push(ocorrencia);
    porDia.set(ocorrencia.dueDate, doDia);
  }

  const membros: MembroComTempoLivre[] = membrosDaCasa.map((membro) => ({
    id: membro.user.id,
    name: membro.user.name,
    freeTime: membro.freeTime ?? null,
  }));

  const dias = [...porDia.keys()].sort();
  const progresso = completionProgress(items);
  const estaSemana = inicio === inicioDaSemana(hoje);

  const base = '/schedule?escopo=' + escopo + '&from=';

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <PageHeader
        title="Cronograma"
        subtitle={
          progresso.total === 0
            ? formatDayAndMonth(inicio) + ' a ' + formatDayAndMonth(fim)
            : progresso.done + ' de ' + progresso.total + ' concluídas nesta semana'
        }
        action={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={escopo}
            aria-label="Escopo da agenda"
          >
            <ToggleButton value="casa" href={'/schedule?escopo=casa&from=' + inicio}>
              Toda a casa
            </ToggleButton>
            <ToggleButton value="minhas" href={'/schedule?escopo=minhas&from=' + inicio}>
              Só as minhas
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ChevronLeftIcon />}
          href={base + addDays(inicio, -7)}
          color="inherit"
        >
          Anterior
        </Button>

        <Button
          href={base + inicioDaSemana(hoje)}
          variant={estaSemana ? 'outlined' : 'text'}
          disabled={estaSemana}
        >
          {estaSemana ? 'Semana atual' : 'Voltar para hoje'}
        </Button>

        <Button
          endIcon={<ChevronRightIcon />}
          href={base + addDays(inicio, 7)}
          color="inherit"
          sx={{ ml: 'auto' }}
        >
          Próxima
        </Button>
      </Stack>

      {dias.length === 0 ? (
        <EmptyState
          title={escopo === 'minhas' ? 'Nada seu nesta semana' : 'Semana livre'}
          description={
            escopo === 'minhas'
              ? 'Nenhuma tarefa designada a você — nem sobraram tarefas sem responsável.'
              : 'Nenhuma tarefa vence entre ' + formatDayAndMonth(inicio) + ' e ' + formatDayAndMonth(fim) + '.'
          }
        />
      ) : (
        <Stack spacing={4}>
          {dias.map((dia) => {
            const doDia = porDia.get(dia) ?? [];
            const feitas = doDia.filter((o) => o.status === 'done').length;

            // Só quem passa do próprio tempo livre. Quem não configurou fica fora da conta.
            const excedidos = cargasDoDia(doDia, membros, weekdayOf(dia)).filter(
              (carga) => carga.excede
            );

            return (
              <Box key={dia}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
                  <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem' }}>
                    {relativeDueLabel(dia, hoje)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDayAndMonth(dia)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                    {feitas}/{doDia.length}
                  </Typography>
                </Box>

                {excedidos.map((carga) => (
                  <Stack
                    key={carga.memberId}
                    direction="row"
                    spacing={0.5}
                    sx={{ alignItems: 'center', mb: 1 }}
                  >
                    <WarningAmberIcon fontSize="small" color="warning" />
                    <Typography variant="body2" color="warning.main">
                      {carga.memberName}: {formatDuration(carga.minutes)} de tarefas para{' '}
                      {formatDuration(carga.freeMinutes)} livres
                      {carga.semEstimativa > 0 &&
                        ' — ' + carga.semEstimativa + ' sem estimativa não entram na conta'}
                    </Typography>
                  </Stack>
                ))}

                <Divider sx={{ mb: 1.5 }} />

                <Stack spacing={1.5}>
                  {doDia.map((ocorrencia) => (
                    <Card key={ocorrencia.id}>
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
                            <Typography
                              variant="h6"
                              component="h4"
                              sx={{
                                textDecoration: ocorrencia.status === 'done' ? 'line-through' : 'none',
                                color: ocorrencia.status === 'done' ? 'text.secondary' : 'inherit',
                              }}
                            >
                              {ocorrencia.task?.name ?? 'Tarefa'}
                            </Typography>

                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                {ocorrencia.assignedTo ? ocorrencia.assignedTo.name : 'Qualquer um'}
                              </Typography>

                              <Tooltip title="Pontos ao ser aprovada">
                                <Chip size="small" variant="outlined" label={ocorrencia.points + ' pts'} />
                              </Tooltip>

                              <Chip
                                size="small"
                                color={CORES[ocorrencia.status]}
                                label={OCCURRENCE_STATUS_LABELS[ocorrencia.status]}
                              />

                              {ocorrencia.status === 'done' && ocorrencia.isLate && (
                                <Chip size="small" color="error" variant="outlined" label="Fora do prazo" />
                              )}
                            </Stack>

                            {ocorrencia.skippedReason && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {ocorrencia.skippedReason}
                              </Typography>
                            )}
                          </Box>

                          <OccurrenceActions
                            occurrenceId={ocorrencia.id}
                            status={ocorrencia.status}
                            canComplete={canComplete(ocorrencia, membership, session.user.id)}
                            canSkip={canSkip(ocorrencia, membership)}
                            canUndo={canUndoOccurrence(ocorrencia, membership)}
                            estimatedMinutes={ocorrencia.task?.estimatedMinutes ?? null}
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Container>
  );
}
