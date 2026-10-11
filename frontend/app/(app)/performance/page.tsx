// app/(app)/performance/page.tsx
// Desempenho: quem fez o quê, o que fica para trás e como a casa está indo.
//
// Duas decisões desta tela valem registro:
//
//   1. O período é escolhido pelo usuário (semana/mês/tudo) e a JANELA vem da própria API,
//      na resposta do ranking. Calcular a semana aqui seria duplicar uma regra que já existe
//      (semana começando no domingo) e que um dia vai divergir.
//   2. Os rótulos dizem de onde o número vem. "No prazo" e "atraso médio" têm definições
//      específicas — medidos contra o FIM do dia de vencimento, no fuso da casa — e sem
//      explicar isso o número vira discussão em vez de informação.

import type { Metadata } from 'next';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/performance/StatCard';
import type { Period } from '@/lib/domain/api/types';
import { formatDelay, formatPercent, formatRating, plural } from '@/lib/domain/format';
import { formatDayAndMonth } from '@/lib/domain/dates';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Desempenho' };

const PERIODOS: { valor: Period; rotulo: string }[] = [
  { valor: 'week', rotulo: 'Semana' },
  { valor: 'month', rotulo: 'Mês' },
  { valor: 'all', rotulo: 'Tudo' },
];

const MEDALHA = ['#d4af37', '#a8a8a8', '#b08d57'];

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodoParam } = await searchParams;
  const period: Period = (['week', 'month', 'all'] as const).includes(periodoParam as Period)
    ? (periodoParam as Period)
    : 'week';

  const { session, householdId } = await requireContext();
  const api = await serverApi();

  const household = await getHousehold(householdId);

  // O ranking primeiro porque ele devolve a janela já resolvida pela API.
  const ranking = await api.stats.leaderboard(householdId, { period });
  const relatorio = await api.stats.household(householdId, {
    from: ranking.from,
    to: ranking.to,
  });

  const eu = relatorio.byMember.find((membro) => membro.user.id === session.user.id);
  const minhaPosicao = ranking.entries.find((entrada) => entrada.user.id === session.user.id);
  const maiorPontuacao = Math.max(1, ...ranking.entries.map((entrada) => entrada.points));

  const { totals } = relatorio;
  const semMovimento = totals.occurrences === 0;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <PageHeader
        title="Desempenho"
        subtitle={
          semMovimento
            ? 'Nada agendado neste período'
            : plural(totals.occurrences, 'tarefa', 'tarefas') +
              ' · ' +
              formatDayAndMonth(ranking.from) +
              ' a ' +
              formatDayAndMonth(ranking.to)
        }
        action={
          <ToggleButtonGroup size="small" exclusive value={period} aria-label="Período">
            {PERIODOS.map((opcao) => (
              <ToggleButton key={opcao.valor} value={opcao.valor} href={'/performance?period=' + opcao.valor}>
                {opcao.rotulo}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
      />

      {semMovimento ? (
        <EmptyState
          title="Sem movimento neste período"
          description="Quando as tarefas da casa começarem a ser concluídas, o placar aparece aqui."
        />
      ) : (
        <Stack spacing={4}>
          {/* ---- eu ---- */}
          {eu && (
            <Card sx={{ borderColor: 'primary.main', borderWidth: 2 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Você
                </Typography>

                <Stack direction="row" spacing={3} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Typography variant="h2" component="p" sx={{ fontSize: '2rem' }}>
                    {eu.points} <Box component="span" sx={{ fontSize: '1rem', color: 'text.secondary' }}>pontos</Box>
                  </Typography>

                  {minhaPosicao && (
                    <Chip
                      icon={<EmojiEventsIcon />}
                      label={minhaPosicao.position + 'º lugar'}
                      color={minhaPosicao.position === 1 ? 'primary' : 'default'}
                      variant={minhaPosicao.position === 1 ? 'filled' : 'outlined'}
                    />
                  )}
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {plural(eu.completed, 'tarefa concluída', 'tarefas concluídas')} ·{' '}
                  {formatPercent(eu.onTimeRate)} no prazo
                  {eu.overdue > 0 && ' · ' + plural(eu.overdue, 'atrasada', 'atrasadas')}
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* ---- ranking ---- */}
          <Box>
            <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem', mb: 2 }}>
              Ranking
            </Typography>

            <Stack spacing={1.5}>
              {ranking.entries.map((entrada) => {
                const souEu = entrada.user.id === session.user.id;

                return (
                  <Card key={entrada.user.id} sx={{ bgcolor: souEu ? 'action.selected' : undefined }}>
                    <CardContent sx={{ py: 2 }}>
                      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        <Typography
                          variant="h3"
                          component="span"
                          sx={{
                            fontSize: '1.1rem',
                            width: 32,
                            textAlign: 'center',
                            color: MEDALHA[entrada.position - 1] ?? 'text.secondary',
                            fontWeight: 700,
                          }}
                        >
                          {entrada.position}º
                        </Typography>

                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body1" fontWeight={souEu ? 700 : 400} noWrap>
                            {entrada.user.name}
                            {souEu && (
                              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                                {' '}(você)
                              </Box>
                            )}
                          </Typography>

                          <LinearProgress
                            variant="determinate"
                            value={(entrada.points / maiorPontuacao) * 100}
                            sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
                          />

                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {plural(entrada.completed, 'concluída', 'concluídas')} ·{' '}
                            {formatPercent(entrada.onTimeRate)} no prazo
                          </Typography>
                        </Box>

                        <Typography variant="h3" component="p" sx={{ fontSize: '1.35rem', whiteSpace: 'nowrap' }}>
                          {entrada.points}
                          <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                            {' '}pts
                          </Box>
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>

          {/* ---- resumo da casa ---- */}
          <Box>
            <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem', mb: 2 }}>
              Como a casa está indo
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
              }}
            >
              <StatCard
                label="Concluídas"
                value={totals.completed + ' de ' + totals.occurrences}
                hint="Tarefas do período que foram marcadas como feitas."
                emphasis
              />
              <StatCard
                label="Taxa de conclusão"
                value={formatPercent(totals.completionRate)}
                hint="Concluídas dividido pelo total de tarefas agendadas no período."
              />
              <StatCard
                label="No prazo"
                value={formatPercent(totals.onTimeRate)}
                hint="Das que foram feitas, quantas saíram até o fim do dia de vencimento, no fuso da casa."
              />
              <StatCard
                label="Atraso médio"
                value={formatDelay(totals.avgCompletionDelayHours)}
                hint="Diferença média entre a conclusão e o fim do dia de vencimento."
              />
              <StatCard
                label="Atrasadas"
                value={String(totals.overdue)}
                hint="Passaram do prazo e continuam sem ser feitas."
              />
              <StatCard
                label="Puladas"
                value={String(totals.skipped)}
                hint="Marcadas como puladas. Não contam como atraso nem geram pontos."
              />
            </Box>
          </Box>

          {/* ---- por tarefa ---- */}
          <Box>
            <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem' }}>
              Tarefas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Ordenadas pelas que mais ficam para trás.
            </Typography>

            <Stack spacing={1}>
              {relatorio.byTask.map((tarefa) => (
                <Card key={tarefa.taskId}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Typography variant="body1" sx={{ flexGrow: 1, minWidth: 160 }}>
                        {tarefa.name}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        {tarefa.completed} de {tarefa.occurrences} feitas
                      </Typography>

                      {tarefa.overdue > 0 ? (
                        <Chip
                          size="small"
                          color="error"
                          variant="outlined"
                          label={plural(tarefa.overdue, 'atrasada', 'atrasadas')}
                        />
                      ) : (
                        <Chip size="small" color="success" variant="outlined" label="Em dia" />
                      )}

                      <Tooltip title="Atraso médio ao concluir esta tarefa">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ width: 150, textAlign: 'right' }}
                        >
                          {tarefa.completed > 0 ? formatDelay(tarefa.avgCompletionDelayHours) : '—'}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>

          {/* ---- por membro ---- */}
          <Box>
            <Typography variant="h3" component="h3" sx={{ fontSize: '1.1rem', mb: 2 }}>
              Por membro
            </Typography>

            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Membro</TableCell>
                    <TableCell align="right">Pontos</TableCell>
                    <TableCell align="right">Feitas</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Tarefas designadas a esta pessoa que passaram do prazo">
                        <span>Atrasadas</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Tarefas designadas a esta pessoa que foram puladas">
                        <span>Puladas</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">No prazo</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Média das notas que ela recebeu ao ser avaliada">
                        <span>Nota</span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {relatorio.byMember.map((membro) => (
                    <TableRow
                      key={membro.user.id}
                      sx={{
                        bgcolor: membro.user.id === session.user.id ? 'action.hover' : undefined,
                      }}
                    >
                      <TableCell>
                        {membro.user.name}
                        {membro.user.id === session.user.id && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {' '}(você)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{membro.points}</TableCell>
                      <TableCell align="right">{membro.completed}</TableCell>
                      <TableCell align="right">{membro.overdue}</TableCell>
                      <TableCell align="right">{membro.skipped}</TableCell>
                      <TableCell align="right">{formatPercent(membro.onTimeRate)}</TableCell>
                      <TableCell align="right">{formatRating(membro.avgRating)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Box>

          <Divider />

          <Typography variant="caption" color="text.secondary">
            O período conta pela data em que cada tarefa <strong>venceu</strong>, não pela data em
            que foi feita — por isso uma tarefa vencida no domingo e concluída na segunda conta
            para a semana anterior. A semana vai de domingo a sábado, no fuso da casa (
            {household.timezone}).
          </Typography>
        </Stack>
      )}
    </Container>
  );
}
