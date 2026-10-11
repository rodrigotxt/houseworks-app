// components/tasks/TaskForm.tsx
// Formulário de tarefa (criar e editar usam o mesmo).
//
// Os campos são NOMEADOS COM O MESMO CAMINHO DO CONTRATO — `recurrence.weekdays`,
// `recurrence.frequency` — e não por acaso: a API devolve o erro de validação em
// `details[].field` usando esse caminho, então o destaque do campo sai de graça, sem
// tabela de tradução para manter em sincronia.

'use client';

import { useActionState, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import SubmitButton from '@/components/ui/SubmitButton';
import type { Difficulty, Frequency, Task } from '@/lib/domain/api/types';
import { DIFFICULTY_LABELS, FREQUENCY_LABELS, WEEKDAY_LABELS } from '@/lib/domain/labels';
import { todayInZone } from '@/lib/domain/dates';
import type { TaskFormState } from './formState';

interface Membro {
  id: string;
  name: string;
}

interface TaskFormProps {
  action: (state: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  members: Membro[];
  timezone: string;
  task?: Task | null;
  submitLabel: string;
  cancelHref: string;
}

const FREQUENCIAS: Frequency[] = ['diaria', 'semanal', 'mensal', 'anual', 'ocasional'];

export default function TaskForm({
  action,
  members,
  timezone,
  task,
  submitLabel,
  cancelHref,
}: TaskFormProps) {
  const [estado, enviar, enviando] = useActionState<TaskFormState, FormData>(action, {
    status: 'idle',
  });

  // A frequência controla quais campos aparecem. Começa na da tarefa (edição) ou em
  // semanal (criação), que é a mais comum numa casa.
  const [frequencia, setFrequencia] = useState<Frequency>(task?.recurrence.frequency ?? 'semanal');
  const [estrategia, setEstrategia] = useState(task?.assignmentStrategy ?? 'fixed');

  const hoje = todayInZone(timezone);
  const erroDe = (campo: string) => estado.fieldErrors?.[campo];

  return (
    <Box component="form" action={enviar} noValidate>
      <Stack spacing={3}>
        {estado.status === 'error' && estado.message && (
          <Alert severity="error">{estado.message}</Alert>
        )}

        <TextField
          name="name"
          label="O que precisa ser feito"
          placeholder="Limpar banheiro"
          defaultValue={task?.name ?? ''}
          error={Boolean(erroDe('name'))}
          helperText={erroDe('name')}
          required
          fullWidth
          autoFocus
        />

        <TextField
          name="description"
          label="Detalhes (opcional)"
          placeholder="Inclui box, vaso, pia e espelho."
          defaultValue={task?.description ?? ''}
          error={Boolean(erroDe('description'))}
          helperText={erroDe('description')}
          multiline
          minRows={2}
          fullWidth
        />

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Com que frequência
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl fullWidth error={Boolean(erroDe('recurrence.frequency'))}>
            <InputLabel id="frequencia">Frequência</InputLabel>
            <Select
              name="recurrence.frequency"
              labelId="frequencia"
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
            {erroDe('recurrence.frequency') && (
              <FormHelperText>{erroDe('recurrence.frequency')}</FormHelperText>
            )}
          </FormControl>

          {frequencia !== 'ocasional' && (
            <TextField
              name="recurrence.interval"
              label="A cada"
              type="number"
              defaultValue={task?.recurrence.interval ?? 1}
              inputProps={{ min: 1, max: 52 }}
              helperText="2 com semanal vira quinzenal"
              sx={{ width: { sm: 180 } }}
            />
          )}
        </Stack>

        {frequencia === 'semanal' && (
          <FormControl error={Boolean(erroDe('recurrence.weekdays'))} component="fieldset" variant="standard">
            <Typography component="legend" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Em quais dias
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {WEEKDAY_LABELS.map((rotulo, indice) => (
                <FormControlLabel
                  key={rotulo}
                  label={rotulo.slice(0, 3)}
                  control={
                    <Checkbox
                      name="recurrence.weekdays"
                      value={indice}
                      defaultChecked={task?.recurrence.weekdays?.includes(indice) ?? indice === 6}
                      size="small"
                    />
                  }
                  sx={{ mr: 1 }}
                />
              ))}
            </Box>
            {erroDe('recurrence.weekdays') && (
              <FormHelperText error>{erroDe('recurrence.weekdays')}</FormHelperText>
            )}
          </FormControl>
        )}

        {(frequencia === 'mensal' || frequencia === 'anual') && (
          <TextField
            name="recurrence.dayOfMonth"
            label="Dia do mês"
            type="number"
            defaultValue={task?.recurrence.dayOfMonth ?? ''}
            inputProps={{ min: 1, max: 31 }}
            helperText="Se o mês não tiver esse dia, cai no último dia dele"
            error={Boolean(erroDe('recurrence.dayOfMonth'))}
            sx={{ width: { sm: 260 } }}
          />
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            name="recurrence.startDate"
            label="A partir de"
            type="date"
            defaultValue={task?.recurrence.startDate ?? hoje}
            InputLabelProps={{ shrink: true }}
            error={Boolean(erroDe('recurrence.startDate'))}
            helperText={erroDe('recurrence.startDate')}
            required
            sx={{ width: { sm: 220 } }}
          />
          <TextField
            name="recurrence.endDate"
            label="Até (opcional)"
            type="date"
            defaultValue={task?.recurrence.endDate ?? ''}
            InputLabelProps={{ shrink: true }}
            error={Boolean(erroDe('recurrence.endDate'))}
            helperText={erroDe('recurrence.endDate')}
            sx={{ width: { sm: 220 } }}
          />
        </Stack>

        <Divider />

        <Typography variant="h3" sx={{ fontSize: '1.05rem' }}>
          Quanto vale e de quem é
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl fullWidth error={Boolean(erroDe('difficulty'))}>
            <InputLabel id="dificuldade">Dificuldade</InputLabel>
            <Select
              name="difficulty"
              labelId="dificuldade"
              label="Dificuldade"
              defaultValue={task?.difficulty ?? 'medio'}
            >
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((valor) => (
                <MenuItem key={valor} value={valor}>
                  {DIFFICULTY_LABELS[valor]}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {erroDe('difficulty') ?? 'Define os pontos automaticamente'}
            </FormHelperText>
          </FormControl>

          <TextField
            name="points"
            label="Pontos (opcional)"
            type="number"
            defaultValue={task?.points ?? ''}
            inputProps={{ min: 0, max: 100 }}
            helperText={erroDe('points') ?? 'Em branco = derivado da dificuldade'}
            error={Boolean(erroDe('points'))}
            sx={{ width: { sm: 260 } }}
          />
        </Stack>

        <FormControl fullWidth error={Boolean(erroDe('assignmentStrategy'))}>
          <InputLabel id="estrategia">Quem faz</InputLabel>
          <Select
            name="assignmentStrategy"
            labelId="estrategia"
            label="Quem faz"
            value={estrategia}
            onChange={(evento) => setEstrategia(evento.target.value as 'fixed' | 'rotate')}
          >
            <MenuItem value="fixed">Uma pessoa fixa</MenuItem>
            <MenuItem value="rotate">Em rodízio entre os membros</MenuItem>
          </Select>
          <FormHelperText>
            {erroDe('assignmentStrategy') ??
              (estrategia === 'rotate'
                ? 'Cada ocorrência vai para um membro diferente'
                : 'Escolha abaixo, ou deixe em branco para qualquer um assumir')}
          </FormHelperText>
        </FormControl>

        {estrategia === 'fixed' && (
          <FormControl fullWidth error={Boolean(erroDe('assignedTo'))}>
            <InputLabel id="responsavel">Responsável</InputLabel>
            <Select
              name="assignedTo"
              labelId="responsavel"
              label="Responsável"
              defaultValue={task?.assignedTo?.id ?? ''}
            >
              <MenuItem value="">Qualquer um</MenuItem>
              {members.map((membro) => (
                <MenuItem key={membro.id} value={membro.id}>
                  {membro.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {erroDe('assignedTo') ?? 'Quem não tem responsável aparece para todos'}
            </FormHelperText>
          </FormControl>
        )}

        <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
          <SubmitButton pending={enviando} label={submitLabel} />
          <Button href={cancelHref} disabled={enviando}>
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
