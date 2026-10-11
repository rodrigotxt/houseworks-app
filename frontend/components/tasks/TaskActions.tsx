// components/tasks/TaskActions.tsx
// Ações de uma tarefa. Arquivar e excluir são destrutivas o bastante para pedir
// confirmação — e a exclusão definitiva apaga o histórico, então ela diz isso.

'use client';

import { useState, useTransition } from 'react';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';

import { archiveTask, destroyTask, unarchiveTask } from '@/app/(app)/tasks/actions';

type Acao = 'arquivar' | 'desarquivar' | 'excluir';

interface TaskActionsProps {
  taskId: string;
  taskName: string;
  archived: boolean;
  /** Só o dono da casa pode excluir de vez. A API também recusa — isto evita o clique. */
  canDestroy: boolean;
}

const TEXTO: Record<Acao, { titulo: string; corpo: string; botao: string }> = {
  arquivar: {
    titulo: 'Arquivar esta tarefa?',
    corpo:
      'Ela sai da lista do dia a dia, mas o histórico e os pontos continuam valendo. Dá para desarquivar depois.',
    botao: 'Arquivar',
  },
  desarquivar: {
    titulo: 'Trazer de volta?',
    corpo: 'A tarefa volta a gerar ocorrências a partir de hoje.',
    botao: 'Desarquivar',
  },
  excluir: {
    titulo: 'Excluir definitivamente?',
    corpo:
      'Isto apaga a tarefa, todas as ocorrências dela e o histórico de execuções. Não tem como desfazer.',
    botao: 'Excluir de vez',
  },
};

export default function TaskActions({ taskId, taskName, archived, canDestroy }: TaskActionsProps) {
  const [acao, setAcao] = useState<Acao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function executar() {
    if (!acao) return;

    setErro(null);

    iniciar(async () => {
      try {
        if (acao === 'arquivar') await archiveTask(taskId);
        else if (acao === 'desarquivar') await unarchiveTask(taskId);
        else await destroyTask(taskId);
      } catch (causa) {
        // As ações de arquivar/excluir redirecionam em caso de sucesso; se chegou aqui,
        // algo falhou antes do redirect.
        setErro(causa instanceof Error ? causa.message : 'Não conseguimos concluir a ação.');
        setAcao(null);
      }
    });
  }

  return (
    <Stack spacing={2}>
      {erro && <Alert severity="error">{erro}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {archived ? (
          <Button variant="outlined" onClick={() => setAcao('desarquivar')} disabled={pendente}>
            Desarquivar
          </Button>
        ) : (
          <Button variant="outlined" onClick={() => setAcao('arquivar')} disabled={pendente}>
            Arquivar
          </Button>
        )}

        {canDestroy && (
          <Button color="error" onClick={() => setAcao('excluir')} disabled={pendente}>
            Excluir
          </Button>
        )}
      </Stack>

      <Dialog open={acao !== null} onClose={() => (pendente ? null : setAcao(null))}>
        <DialogTitle>{acao ? TEXTO[acao].titulo : ''}</DialogTitle>
        <DialogContent>
          <DialogContentText>{acao ? TEXTO[acao].corpo : ''}</DialogContentText>
          <DialogContentText sx={{ mt: 2, fontWeight: 600 }}>{taskName}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAcao(null)} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            onClick={executar}
            color={acao === 'excluir' ? 'error' : 'primary'}
            variant="contained"
            disabled={pendente}
          >
            {pendente ? 'Aguarde…' : acao ? TEXTO[acao].botao : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
