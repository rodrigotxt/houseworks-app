// components/schedule/OccurrenceActions.tsx
// O que dá para fazer com uma ocorrência.
//
// "Fiz" conclui em UM clique, sem diálogo: é o gesto mais repetido do app e merece o
// caminho mais curto. A nota é opcional e aparece num segundo momento; pular e desfazer
// pedem confirmação porque têm consequência (pular tira do placar, desfazer apaga a
// execução e os pontos).

'use client';

import { useActionState, useEffect, useState } from 'react';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import CheckIcon from '@mui/icons-material/Check';
import UndoIcon from '@mui/icons-material/Undo';
import SkipNextIcon from '@mui/icons-material/SkipNext';

import {
  completeOccurrence,
  skipOccurrence,
  undoOccurrence,
} from '@/app/(app)/schedule/actions';
import { EMPTY_OCCURRENCE_ACTION } from './actionState';

interface OccurrenceActionsProps {
  occurrenceId: string;
  status: 'pending' | 'done' | 'overdue' | 'skipped';
  /** Vem das regras espelhadas — a API valida de novo, isto só evita o clique inútil. */
  canComplete: boolean;
  canSkip: boolean;
  canUndo: boolean;
  /** Estimativa da tarefa, em minutos. Serve para pré-preencher o tempo real. */
  estimatedMinutes?: number | null;
  /** Na TV não existe ponteiro: alvos maiores e nada de hover. */
  large?: boolean;
}

type Dialogo = 'nota' | 'pular' | 'desfazer' | null;

export default function OccurrenceActions({
  occurrenceId,
  status,
  canComplete,
  canSkip,
  canUndo,
  estimatedMinutes,
  large,
}: OccurrenceActionsProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const [conclusao, concluir, concluindo] = useActionState(
    completeOccurrence.bind(null, occurrenceId),
    EMPTY_OCCURRENCE_ACTION
  );
  const [pulo, pular, pulando] = useActionState(
    skipOccurrence.bind(null, occurrenceId),
    EMPTY_OCCURRENCE_ACTION
  );
  const [, desfazer, desfazendo] = useActionState(
    undoOccurrence.bind(null, occurrenceId),
    EMPTY_OCCURRENCE_ACTION
  );

  const ocupado = concluindo || pulando || desfazendo;
  const erro = conclusao.message ?? pulo.message;
  const tamanho = large ? 'large' : 'medium';

  // Fecha o diálogo quando a ação dá CERTO.
  //
  // Precisa ser um efeito sobre o resultado, e não um setDialogo no envio: quem sabe se deu
  // certo é a Server Action. Fechar antes de enviar esconderia a mensagem de "alguém da casa
  // já marcou esta" — que é comum e merece ficar na tela, com o diálogo aberto.
  useEffect(() => {
    if (conclusao.status === 'ok') setDialogo(null);
  }, [conclusao]);

  useEffect(() => {
    if (pulo.status === 'ok') setDialogo(null);
  }, [pulo]);

  return (
    <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
      {erro && <Alert severity="warning" sx={{ width: '100%' }}>{erro}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {canComplete && (
          <Button
            variant="contained"
            size={tamanho}
            startIcon={<CheckIcon />}
            onClick={() => setDialogo('nota')}
            disabled={ocupado}
          >
            Fiz
          </Button>
        )}

        {canUndo && status === 'done' && (
          <Button
            variant="outlined"
            size={tamanho}
            startIcon={<UndoIcon />}
            onClick={() => setDialogo('desfazer')}
            disabled={ocupado}
          >
            Desfazer
          </Button>
        )}

        {canSkip && status !== 'done' && status !== 'skipped' && (
          <Button
            variant="text"
            size={tamanho}
            startIcon={<SkipNextIcon />}
            onClick={() => setDialogo('pular')}
            disabled={ocupado}
            color="inherit"
          >
            Pular
          </Button>
        )}
      </Stack>

      {/* Concluir: a nota é opcional, e é por isso que o botão "Fiz" não salva direto. */}
      <Dialog open={dialogo === 'nota'} onClose={() => (ocupado ? null : setDialogo(null))}>
        <form action={concluir}>
          <DialogTitle>Concluir</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Quer deixar um comentário? Outro membro vai conferir e dar a nota.
            </DialogContentText>
            <TextField
              name="note"
              label="Comentário (opcional)"
              placeholder="Banheiro limpo e brilhando!"
              multiline
              minRows={2}
              fullWidth
              autoFocus
            />

            {/* Opcional de proposito: quem so quer marcar que fez nao deve ser obrigado a
                cronometrar. Em branco, vale a estimativa da tarefa -- e a execucao fica
                registrada como presumida, para a media nao mentir. */}
            <TextField
              name="actualMinutes"
              label="Quanto tempo levou (min)"
              type="number"
              inputProps={{ min: 0, max: 1440 }}
              defaultValue={estimatedMinutes ?? ''}
              helperText={
                estimatedMinutes
                  ? 'Em branco = ' + estimatedMinutes + ' min, a estimativa da tarefa'
                  : 'Opcional'
              }
              fullWidth
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Concluir'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={dialogo === 'pular'} onClose={() => (ocupado ? null : setDialogo(null))}>
        <form action={pular}>
          <DialogTitle>Pular esta tarefa</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Pular não gera pontos e não conta como atraso. O motivo fica registrado.
            </DialogContentText>
            <TextField
              name="reason"
              label="Por quê? (opcional)"
              placeholder="Viajamos no fim de semana."
              multiline
              minRows={2}
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Pular'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={dialogo === 'desfazer'} onClose={() => (ocupado ? null : setDialogo(null))}>
        <DialogTitle>Desfazer a conclusão?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A execução é apagada e os pontos saem do placar. Se já tiver sido avaliada, a nota
            também se perde.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogo(null)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setDialogo(null);
              desfazer();
            }}
            disabled={ocupado}
          >
            {ocupado ? 'Aguarde…' : 'Desfazer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
