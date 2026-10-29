// components/reminders/ReminderActions.tsx
// O que dá para fazer com um lembrete: feito, adiar, editar e arquivar.
//
// "Feito" resolve a notificação para MIM — não desliga a recorrência. O remédio das 21h
// continua valendo amanhã; é por isso que o botão não se chama "concluir".

'use client';

import { useActionState, useEffect, useState } from 'react';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';

import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import SnoozeIcon from '@mui/icons-material/Snooze';

import {
  acknowledgeReminder,
  archiveReminder,
  snoozeReminder,
} from '@/app/(app)/reminders/actions';
import type { ReminderStatus } from '@/lib/domain/api/types';
import { EMPTY_REMINDER_ACTION } from './formState';

interface ReminderActionsProps {
  reminderId: string;
  status: ReminderStatus;
  /** Quem administra lembretes ou criou este pode editar/arquivar. */
  canEdit: boolean;
  /** Recebe o lembrete (explícito ou "todos"). */
  isRecipient: boolean;
  /** Tem notificação não resolvida — é o que dá sentido a "Feito"/"Adiar". */
  hasPending: boolean;
  /** Na TV não existe ponteiro: alvos maiores. */
  large?: boolean;
}

export default function ReminderActions({
  reminderId,
  status,
  canEdit,
  isRecipient,
  hasPending,
  large,
}: ReminderActionsProps) {
  const [dialogo, setDialogo] = useState<'adiar' | 'arquivar' | null>(null);

  const [feito, marcarFeito, marcando] = useActionState(
    acknowledgeReminder.bind(null, reminderId),
    EMPTY_REMINDER_ACTION
  );
  const [adiado, adiar, adiando] = useActionState(
    snoozeReminder.bind(null, reminderId),
    EMPTY_REMINDER_ACTION
  );
  const [arquivado, arquivar, arquivando] = useActionState(
    archiveReminder.bind(null, reminderId),
    EMPTY_REMINDER_ACTION
  );

  const ocupado = marcando || adiando || arquivando;
  const erro = feito.message ?? adiado.message ?? arquivado.message;
  const tamanho = large ? 'large' : 'medium';

  useEffect(() => {
    if (feito.status === 'ok' || adiado.status === 'ok') setDialogo(null);
  }, [feito.status, adiado.status]);

  useEffect(() => {
    if (arquivado.status === 'ok') setDialogo(null);
  }, [arquivado.status]);

  return (
    <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
      {erro && <Alert severity="warning" sx={{ width: '100%' }}>{erro}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {isRecipient && hasPending && (
          <Button
            variant="contained"
            size={tamanho}
            startIcon={<CheckIcon />}
            onClick={() => marcarFeito()}
            disabled={ocupado}
          >
            Feito
          </Button>
        )}

        {isRecipient && (
          <Button
            variant="outlined"
            size={tamanho}
            startIcon={<SnoozeIcon />}
            onClick={() => setDialogo('adiar')}
            disabled={ocupado}
          >
            Adiar
          </Button>
        )}

        {canEdit && (
          <Button
            variant="text"
            size={tamanho}
            startIcon={<EditIcon />}
            href={'/reminders/' + reminderId + '/edit'}
            color="inherit"
          >
            Editar
          </Button>
        )}

        {canEdit && status !== 'archived' && (
          <Button
            variant="text"
            size={tamanho}
            startIcon={<ArchiveIcon />}
            onClick={() => setDialogo('arquivar')}
            disabled={ocupado}
            color="inherit"
          >
            Arquivar
          </Button>
        )}
      </Stack>

      <Dialog open={dialogo === 'adiar'} onClose={() => (ocupado ? null : setDialogo(null))}>
        <form action={adiar}>
          <DialogTitle>Adiar por quanto tempo?</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              O adiamento vale só para você. O lembrete continua igual para os outros.
            </DialogContentText>
            <RadioGroup name="minutes" defaultValue="10">
              <FormControlLabel value="10" control={<Radio />} label="10 minutos" />
              <FormControlLabel value="30" control={<Radio />} label="30 minutos" />
              <FormControlLabel value="60" control={<Radio />} label="1 hora" />
              <FormControlLabel value="180" control={<Radio />} label="3 horas" />
            </RadioGroup>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={ocupado}>
              {ocupado ? 'Adiando…' : 'Adiar'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={dialogo === 'arquivar'} onClose={() => (ocupado ? null : setDialogo(null))}>
        <DialogTitle>Arquivar este lembrete?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Ele para de tocar e sai da lista. As notificações que já chegaram continuam no
            histórico. Um lembrete de disparo único já se arquiva sozinho depois de tocar.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogo(null)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => arquivar()}
            disabled={ocupado}
          >
            {ocupado ? 'Arquivando…' : 'Arquivar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
