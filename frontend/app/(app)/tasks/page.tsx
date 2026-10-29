// app/(app)/tasks/page.tsx
// A lista de tarefas da casa.
//
// Os filtros vivem na URL e o formulário de busca é um <form method="get"> comum: o
// servidor filtra, a URL é compartilhável, o botão "voltar" funciona e nada disso
// depende de JavaScript no cliente.

import type { Metadata } from 'next';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import SearchIcon from '@mui/icons-material/Search';

import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import { isApiError } from '@/lib/domain/api';
import { DIFFICULTY_LABELS, describeRecurrence } from '@/lib/domain/labels';
import { canCreateTask, canEditTask } from '@/lib/domain/rules';
import { requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Tarefas' };

interface Props {
  searchParams: Promise<{ status?: string; q?: string }>;
}

export default async function TasksPage({ searchParams }: Props) {
  const { status: statusParam, q } = await searchParams;
  const status = statusParam === 'archived' ? 'archived' : 'active';

  const { membership, householdId } = await requireContext();
  const api = await serverApi();

  try {
    const { items: tarefas, meta } = await api.tasks.list(householdId, {
      status,
      q: q && q.length >= 2 ? q : undefined,
      pageSize: 100,
    });

    const podeCriar = canCreateTask(membership);
    // Mesma capacidade hoje, mas nomeada pela regra certa: editar nao e criar, e a lista
    // deve seguir o que a regra de edicao disser se as duas divergirem um dia.
    const podeEditar = canEditTask(membership);
    const filtrando = Boolean(q);
    const base = '/tasks?status=' + status;

    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageHeader
          title="Tarefas"
          subtitle={
            meta.total === 0
              ? 'Nada por aqui.'
              : meta.total + (meta.total === 1 ? ' tarefa' : ' tarefas')
          }
          action={
            podeCriar ? (
              <Button variant="contained" href="/tasks/new">
                Nova tarefa
              </Button>
            ) : undefined
          }
        />

        <Tabs value={status} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Ativas" value="active" href="/tasks?status=active" />
          <Tab label="Arquivadas" value="archived" href="/tasks?status=archived" />
        </Tabs>

        <Box component="form" method="get" sx={{ mb: 3, display: 'flex', gap: 1 }}>
          <input type="hidden" name="status" value={status} />
          <TextField
            name="q"
            size="small"
            placeholder="Buscar pelo nome…"
            defaultValue={q ?? ''}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ maxWidth: 360, flexGrow: 1 }}
          />
          <Button type="submit" variant="outlined">
            Buscar
          </Button>
          {filtrando && (
            <Button href={base} color="inherit">
              Limpar
            </Button>
          )}
        </Box>

        {tarefas.length === 0 ? (
          <EmptyState
            title={filtrando ? 'Nada encontrado' : status === 'archived' ? 'Nenhuma tarefa arquivada' : 'Nenhuma tarefa na casa'}
            description={
              filtrando
                ? 'Tente outro termo, ou limpe a busca.'
                : status === 'archived'
                  ? 'Tarefas arquivadas ficam guardadas aqui — o histórico e os pontos continuam valendo.'
                  : 'Crie a primeira tarefa para a casa começar a se organizar.'
            }
            actionLabel={!filtrando && status === 'active' && podeCriar ? 'Criar tarefa' : undefined}
            actionHref={!filtrando && status === 'active' && podeCriar ? '/tasks/new' : undefined}
          />
        ) : (
          <Stack spacing={1.5}>
            {tarefas.map((tarefa) => (
              <Card key={tarefa.id} sx={{ opacity: status === 'archived' ? 0.75 : 1 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ flexGrow: 1, minWidth: 220 }}>
                      <Typography
                        variant="h6"
                        component="h3"
                        sx={{ '& a': { color: 'inherit', textDecoration: 'none' }, '& a:hover': { textDecoration: 'underline' } }}
                      >
                        <a href={'/tasks/' + tarefa.id}>{tarefa.name}</a>
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        {describeRecurrence(tarefa.recurrence)}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip size="small" variant="outlined" label={DIFFICULTY_LABELS[tarefa.difficulty]} />

                      <Tooltip title="Pontos ao concluir e ser aprovada">
                        <Chip size="small" color="primary" label={tarefa.points + ' pts'} />
                      </Tooltip>

                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          tarefa.assignmentStrategy === 'rotate'
                            ? 'Em rodízio'
                            : tarefa.assignedTo
                              ? tarefa.assignedTo.name
                              : 'Qualquer um'
                        }
                      />

                      {/* A edicao existia so dentro da ficha, e quem procurava na lista nao
                          achava. O caminho curto precisa estar onde a tarefa aparece. */}
                      {podeEditar && (
                        <Button
                          size="small"
                          variant="outlined"
                          href={'/tasks/' + tarefa.id + '/edit'}
                        >
                          Editar
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Container>
    );
  } catch (causa) {
    if (isApiError(causa) && causa.code === 'NOT_HOUSEHOLD_MEMBER') {
      return (
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Alert severity="warning">
            Você não tem mais acesso a esta casa. Escolha outra ou peça um convite novo.
          </Alert>
        </Container>
      );
    }
    throw causa;
  }
}
