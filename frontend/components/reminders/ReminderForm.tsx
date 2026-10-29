// components/reminders/ReminderForm.tsx
// Formulário de lembrete (criar e editar usam o mesmo).
//
// Os campos usam o MESMO caminho do contrato — `schedule.frequency`, `schedule.weekdays`,
// `recipients` — porque a API devolve o erro de validação em `details[].field` com esse
// caminho. O destaque do campo sai de graça.

'use client';

import { useActionState, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import SubmitButton from '@/components/ui/SubmitButton';
import type { Frequency, Reminder, ReminderChannel, ReminderSchedule } from '@/lib/domain/api/types';
import { todayInZone } from '@/lib/domain/dates';
import { FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/domain/labels';
import type { ReminderFormState } from './formState';

export interface MembroDoLembrete {
  id: string;
  name: string;
  role: string;
}

export interface TarefaDoLembrete {
  id: string;
  name: string;
}

interface ReminderFormProps {
  action: (state: ReminderFormState, formData: FormData) => Promise<ReminderFormState>;
  members: MembroDoLembrete[];
  tasks: TarefaDoLembrete[];
  timezone: string;
  reminder?: Reminder | null;
  /** Adulto/owner administra qualquer lembrete; criança só os próprios, e só para si. */
  canManage: boolean;
  currentUserId?: string;
  pushEnabled: boolean;
  submitLabel: string;
  cancelHref: string;
}

const FREQUENCIAS: Frequency[] = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];

export default function ReminderForm({
  action,
  members,
  tasks,
  timezone,
  reminder,
  canManage,
  currentUserId,
  pushEnabled,
  submitLabel,
  cancelHref,
}: ReminderFormProps) {
  const [estado, enviar, enviando] = useActionState<ReminderFormState, FormData>(action, {
    status: 'idle',
  });

  const [frequencia, setFrequencia] = useState<Frequency>(
    reminder?.schedule.frequency ?? 'diaria'
  );
  const [todos, setTodos] = useState(Boolean(reminder?.allMembers));

  const erroDe = (campo: string) => estado.fieldErrors?.[campo];
  const hoje = todayInZone(timezone);

  const destinatariosAtuais = new Set((reminder?.recipients ?? []).map((pessoa) => pessoa.id));
  const canaisAtuais = new Set<ReminderChannel>(reminder?.channels ?? ['in_app']);
  const diasAtuais = new Set(reminder?.schedule.weekdays ?? []);

  const horario: ReminderSchedule['time'] = reminder?.schedule.time ?? '08:00';

  return (
    <Box component="form" action={enviar} noValidate>
      <Stack spacing={3}>
        {estado.status === 'error' && estado.message && (
          <Alert severity="error">{estado.message}</Alert>
        )}

        <TextField
          name="title"
          label="Do que você quer lembrar"
          placeholder="Tomar o remédio"
          defaultValue={reminder?.title ?? ''}
          error={Boolean(erroDe('title'))}
          helperText={erroDe('title')}
          required
          fullWidth
          autoFocus
        />

        <TextField
          name="notes"
          label="Detalhes (opcional)"
          placeholder="Depois do jantar, com um copo de água."
          defaultValue={reminder?.notes ?? ''}
          error={Boolean(erroDe('notes'))}
          helperText={erroDe('notes')}
          multiline
          minRows={2}
          fullWidth
        />

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Quando
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl fullWidth error={Boolean(erroDe('schedule.frequency'))}>
            <InputLabel id="frequencia-lembrete">Frequência</InputLabel>
            <Select
              name="schedule.frequency"
              labelId="frequencia-lembrete"
              label="Frequência"
              value={frequencia}
              onChange={(evento) => setFrequencia(evento.target.value as Frequency)}
            >
              {FREQUENCIAS.map((valor) => (
                <MenuItem key={valor} value={valor}>
                  {FREQUENCY_LABELS[valor]}
                </MenuItem>
              ))}
            </Select>
            {erroDe('schedule.frequency') && (
              <FormHelperText error>{erroDe('schedule.frequency')}</FormHelperText>
            )}
          </FormControl>

          <TextField
            name="schedule.time"
            label="Hora"
            type="time"
            defaultValue={horario}
            error={Boolean(erroDe('schedule.time'))}
            helperText={erroDe('schedule.time') || 'Hora local da casa'}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {frequencia !== 'ocasional' && (
            <TextField
              name="schedule.interval"
              label="A cada"
              type="number"
              inputProps={{ min: 1, max: 52 }}
              defaultValue={reminder?.schedule.interval ?? 1}
              error={Boolean(erroDe('schedule.interval'))}
              helperText={erroDe('schedule.interval') || '1 = todo período'}
              fullWidth
            />
          )}
        </Stack>

        {frequencia === 'semanal' && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Em quais dias
            </Typography>
            <FormGroup row>
              {WEEKDAY_LABELS.map((rotulo, indice) => (
                <FormControlLabel
                  key={rotulo}
                  control={
                    <Checkbox
                      name="schedule.weekdays"
                      value={indice}
                      defaultChecked={diasAtuais.has(indice)}
                    />
                  }
                  label={rotulo}
                />
              ))}
            </FormGroup>
            {erroDe('schedule.weekdays') && (
              <FormHelperText error>{erroDe('schedule.weekdays')}</FormHelperText>
            )}
          </Box>
        )}

        {frequencia === 'mensal' && (
          <TextField
            name="schedule.dayOfMonth"
            label="Dia do mês"
            type="number"
            inputProps={{ min: 1, max: 31 }}
            defaultValue={reminder?.schedule.dayOfMonth ?? ''}
            error={Boolean(erroDe('schedule.dayOfMonth'))}
            helperText={
              erroDe('schedule.dayOfMonth') ||
              'Em meses sem esse dia, vale o último dia do mês.'
            }
            sx={{ maxWidth: 240 }}
          />
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            name="schedule.startDate"
            label={frequencia === 'ocasional' ? 'Data' : 'Começa em'}
            type="date"
            defaultValue={reminder?.schedule.startDate ?? hoje}
            error={Boolean(erroDe('schedule.startDate'))}
            helperText={erroDe('schedule.startDate')}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            name="schedule.endDate"
            label="Termina em (opcional)"
            type="date"
            defaultValue={reminder?.schedule.endDate ?? ''}
            error={Boolean(erroDe('schedule.endDate'))}
            helperText={erroDe('schedule.endDate') || 'Em branco = sem fim'}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Quem recebe
        </Typography>

        {canManage ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={todos}
                  onChange={(evento) => setTodos(evento.target.checked)}
                />
              }
              label="Todos da casa"
            />
            <input type="hidden" name="allMembers" value={todos ? 'on' : 'off'} />

            {!todos && (
              <FormGroup>
                {members.map((membro) => (
                  <FormControlLabel
                    key={membro.id}
                    control={
                      <Checkbox
                        name="recipients"
                        value={membro.id}
                        defaultChecked={destinatariosAtuais.has(membro.id)}
                      />
                    }
                    label={
                      membro.id === currentUserId ? membro.name + ' (você)' : membro.name
                    }
                  />
                ))}
                {erroDe('recipients') && (
                  <FormHelperText error>{erroDe('recipients')}</FormHelperText>
                )}
              </FormGroup>
            )}
          </>
        ) : (
          <Alert severity="info">
            Como criança, você cria lembretes apenas para você mesma. Um adulto pode criar
            para a casa inteira.
          </Alert>
        )}

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Como avisar
        </Typography>

        <input type="hidden" name="channels" value="in_app" />

        <FormGroup>
          <FormControlLabel
            control={<Checkbox checked disabled />}
            label="No app (sempre)"
          />
          {pushEnabled ? (
            <FormControlLabel
              control={
                <Checkbox
                  name="channels"
                  value="push"
                  defaultChecked={canaisAtuais.has('push')}
                />
              }
              label="Notificação push neste aparelho"
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Push indisponível: o servidor ainda não tem as chaves VAPID. O aviso aparece
              na caixa de notificações do app.
            </Typography>
          )}
        </FormGroup>

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Vínculo com tarefa (opcional)
        </Typography>

        <TextField
          select
          name="task"
          label="Conferir uma tarefa"
          defaultValue={reminder?.task?.id ?? ''}
          helperText="Com uma tarefa vinculada, o aviso não sai quando ela já foi feita no dia."
          fullWidth
        >
          <MenuItem value="">Nenhuma</MenuItem>
          {tasks.map((tarefa) => (
            <MenuItem key={tarefa.id} value={tarefa.id}>
              {tarefa.name}
            </MenuItem>
          ))}
        </TextField>

        <FormControlLabel
          control={
            <Checkbox
              name="skipIfTaskDone"
              defaultChecked={reminder ? reminder.skipIfTaskDone : true}
            />
          }
          label="Não me avisar se a tarefa já estiver concluída"
        />

        <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
          <SubmitButton pending={enviando} label={submitLabel} />
          <Button href={cancelHref} color="inherit" disabled={enviando}>
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
