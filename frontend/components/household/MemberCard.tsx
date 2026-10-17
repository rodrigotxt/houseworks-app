// components/household/MemberCard.tsx
// Um membro da casa: quem e, o que pode, e o que da para fazer a respeito.
//
// TUDO o que muda estado passa por dialogo. Trocar o papel de alguem muda na hora o que a
// pessoa consegue fazer na casa -- um seletor solto na lista seria facil demais de acionar
// sem querer, e nao ha desfazer.

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { leaveHousehold, removeMember, saveMember } from '@/app/(app)/household/actions';
import type { Membership } from '@/lib/domain/api/types';
import { formatInstant } from '@/lib/domain/dates';
import {
  DIAS_NA_SEMANA,
  SEMANA_VAZIA,
  hoursTextToMinutes,
  minutesToHoursText,
  type FreeTime,
  type FreeTimeMode,
} from '@/lib/domain/freeTime';
import { CAPABILITY_LABELS, ROLE_HINTS, ROLE_LABELS, WEEKDAY_SHORT } from '@/lib/domain/labels';
import {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  hasAdjustedCapabilities,
  type Capability,
  type Role,
} from '@/lib/domain/rules';

interface MemberCardProps {
  member: Membership;
  timeZone: string;
  isSelf: boolean;
  /** Somente o owner edita papel e permissoes. */
  canManage: boolean;
  /** Este membro e o unico owner: a API recusa rebaixa-lo ou remove-lo. */
  onlyOwner: boolean;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);

  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Sete textos de hora, domingo primeiro, a partir do que veio da API. */
function semanaEmHoras(freeTime: Membership['freeTime']): string[] {
  return Array.from({ length: DIAS_NA_SEMANA }, (_, dia) => {
    if (!freeTime) return '0';

    const minutos =
      freeTime.mode === 'fixo' ? (freeTime.fixedMinutes ?? 0) : (freeTime.byWeekday?.[dia] ?? 0);

    return minutesToHoursText(minutos);
  });
}

export default function MemberCard({
  member,
  timeZone,
  isSelf,
  canManage,
  onlyOwner,
}: MemberCardProps) {
  const router = useRouter();

  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [papel, setPapel] = useState<Role>(member.role);
  const [permissoes, setPermissoes] = useState<Record<Capability, boolean>>(member.capabilities);

  // null = nunca configurado, que e diferente de zero (zero gera aviso de carga).
  const [temTempoLivre, setTemTempoLivre] = useState(member.freeTime != null);
  const [modoTempo, setModoTempo] = useState<FreeTimeMode>(member.freeTime?.mode ?? 'fixo');
  const [horasFixo, setHorasFixo] = useState(minutesToHoursText(member.freeTime?.fixedMinutes ?? 0));
  const [horasPorDia, setHorasPorDia] = useState<string[]>(semanaEmHoras(member.freeTime));

  const ajustado = hasAdjustedCapabilities(member);
  const semPermissoes = CAPABILITIES.every((capacidade) => !member.capabilities[capacidade]);

  const podeEditar = canManage;
  const podeRemover = canManage && !isSelf && !onlyOwner;
  const podeSair = isSelf && !onlyOwner;

  function abrirEdicao() {
    setErro(null);
    setPapel(member.role);
    setPermissoes(member.capabilities);
    setTemTempoLivre(member.freeTime != null);
    setModoTempo(member.freeTime?.mode ?? 'fixo');
    setHorasFixo(minutesToHoursText(member.freeTime?.fixedMinutes ?? 0));
    setHorasPorDia(semanaEmHoras(member.freeTime));
    setEditando(true);
  }

  // Ao trocar para "por dia" com tudo zerado, comeca com o valor fixo em todos os dias:
  // e o que a pessoa quis dizer, e evita redigitar sete vezes.
  function trocarModoTempo(novo: FreeTimeMode) {
    setModoTempo(novo);

    const tudoZero = horasPorDia.every((hora) => hoursTextToMinutes(hora) === 0);
    if (novo === 'por_dia' && tudoZero && hoursTextToMinutes(horasFixo) > 0) {
      setHorasPorDia(Array(DIAS_NA_SEMANA).fill(horasFixo));
    }
  }

  function tempoLivreParaSalvar(): FreeTime | null {
    if (!temTempoLivre) return null;

    if (modoTempo === 'fixo') {
      return {
        mode: 'fixo',
        fixedMinutes: hoursTextToMinutes(horasFixo),
        byWeekday: [...SEMANA_VAZIA],
      };
    }

    return {
      mode: 'por_dia',
      fixedMinutes: null,
      byWeekday: horasPorDia.map(hoursTextToMinutes),
    };
  }

  function trocarPapel(novo: Role) {
    setPapel(novo);
    // Trocar o papel significa aplicar o PADRAO dele. Deixar as permissoes antigas grudadas
    // produziria um adulto que nao avalia, sem ninguem entender por que.
    setPermissoes(ROLE_CAPABILITIES[novo]);
  }

  function salvar() {
    setErro(null);

    iniciar(async () => {
      const resultado = await saveMember(member.user.id, papel, permissoes, tempoLivreParaSalvar());

      if (resultado.status === 'error') {
        setErro(resultado.message ?? null);
        return;
      }

      setEditando(false);
    });
  }

  function confirmarRemocao() {
    setErro(null);

    iniciar(async () => {
      const resultado = await removeMember(member.user.id);

      if (resultado.status === 'error') {
        setErro(resultado.message ?? null);
        setRemovendo(false);
        return;
      }

      setRemovendo(false);
    });
  }

  function confirmarSaida() {
    setErro(null);

    iniciar(async () => {
      const resultado = await leaveHousehold();

      if (resultado.status === 'error') {
        setErro(resultado.message ?? null);
        setSaindo(false);
        return;
      }

      // Saiu da casa. Se ainda houver outra, o layout resolve; se nao houver, cai no onboarding.
      router.replace('/tasks');
      router.refresh();
    });
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Avatar sx={{ bgcolor: isSelf ? 'primary.main' : 'grey.500' }}>
            {iniciais(member.user.name)}
          </Avatar>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h6" component="h3">
                {member.user.name}
              </Typography>

              {isSelf && <Chip size="small" color="primary" label="você" />}
            </Stack>

            <Typography variant="body2" color="text.secondary">
              @{member.user.username} · entrou em {formatInstant(member.joinedAt, timeZone)}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              size="small"
              color={member.role === 'owner' ? 'primary' : 'default'}
              variant={member.role === 'owner' ? 'filled' : 'outlined'}
              label={ROLE_LABELS[member.role]}
            />

            {ajustado && (
              <Chip size="small" variant="outlined" color="warning" label="permissões ajustadas" />
            )}
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Pode:
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {semPermissoes ? (
            <Typography variant="body2" color="text.secondary">
              Nada além de executar o que lhe designarem.
            </Typography>
          ) : (
            CAPABILITIES.filter((capacidade) => member.capabilities[capacidade]).map((capacidade) => (
              <Chip key={capacidade} size="small" variant="outlined" label={CAPABILITY_LABELS[capacidade]} />
            ))
          )}
        </Stack>

        {(podeEditar || podeRemover || podeSair) && (
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
            {podeEditar && (
              <Button size="small" variant="outlined" onClick={abrirEdicao} disabled={pendente}>
                Editar papel e permissões
              </Button>
            )}

            {podeRemover && (
              <Button size="small" color="error" onClick={() => setRemovendo(true)} disabled={pendente}>
                Remover da casa
              </Button>
            )}

            {podeSair && (
              <Button size="small" color="error" onClick={() => setSaindo(true)} disabled={pendente}>
                Sair da casa
              </Button>
            )}
          </Stack>
        )}

        {isSelf && onlyOwner && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Você é o único responsável pela casa — promova outra pessoa antes de sair ou mudar de papel.
          </Typography>
        )}
      </CardContent>

      {/* -------- editar papel e permissoes -------- */}
      <Dialog open={editando} onClose={() => (pendente ? null : setEditando(false))} fullWidth maxWidth="sm">
        <DialogTitle>Papel e permissões</DialogTitle>

        <DialogContent>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

          <DialogContentText sx={{ mb: 2 }}>
            <strong>{member.user.name}</strong> · @{member.user.username}
          </DialogContentText>

          <TextField
            select
            fullWidth
            label="Papel"
            value={papel}
            onChange={(evento) => trocarPapel(evento.target.value as Role)}
            disabled={pendente || (isSelf && onlyOwner)}
            helperText={
              isSelf && onlyOwner
                ? 'A casa precisa de pelo menos um responsável.'
                : ROLE_HINTS[papel]
            }
            sx={{ mb: 1 }}
          >
            {(['owner', 'adult', 'child'] as Role[]).map((opcao) => (
              <MenuItem key={opcao} value={opcao}>
                {ROLE_LABELS[opcao]}
              </MenuItem>
            ))}
          </TextField>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Trocar o papel aplica as permissões padrão dele. Ajuste abaixo o que precisar.
          </Typography>

          <Stack sx={{ mt: 1 }}>
            {CAPABILITIES.map((capacidade) => (
              <FormControlLabel
                key={capacidade}
                control={
                  <Switch
                    checked={permissoes[capacidade]}
                    onChange={(evento) =>
                      setPermissoes((atual) => ({ ...atual, [capacidade]: evento.target.checked }))
                    }
                    disabled={pendente}
                  />
                }
                label={CAPABILITY_LABELS[capacidade]}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Tempo livre para as tarefas
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Quanto tempo a pessoa tem por dia para fazer as tarefas da casa. Serve para avisar
            quando o dia passa do tempo disponível — não bloqueia nada.
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={temTempoLivre}
                onChange={(evento) => setTemTempoLivre(evento.target.checked)}
                disabled={pendente}
              />
            }
            label="Definir tempo livre"
          />

          {temTempoLivre && (
            <Box sx={{ mt: 1 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Como informar"
                value={modoTempo}
                onChange={(evento) => trocarModoTempo(evento.target.value as FreeTimeMode)}
                disabled={pendente}
                sx={{ mb: 2 }}
              >
                <MenuItem value="fixo">O mesmo todos os dias</MenuItem>
                <MenuItem value="por_dia">Diferente por dia da semana</MenuItem>
              </TextField>

              {modoTempo === 'fixo' ? (
                <TextField
                  label="Horas por dia"
                  type="number"
                  size="small"
                  value={horasFixo}
                  onChange={(evento) => setHorasFixo(evento.target.value)}
                  inputProps={{ min: 0, max: 24, step: 0.5 }}
                  helperText="Em horas. Meia hora é 0.5."
                  disabled={pendente}
                  sx={{ width: 200 }}
                />
              ) : (
                <Stack spacing={1}>
                  {WEEKDAY_SHORT.map((rotulo, dia) => (
                    <Stack key={rotulo} direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ width: 36 }}>
                        {rotulo}
                      </Typography>
                      <TextField
                        type="number"
                        size="small"
                        value={horasPorDia[dia]}
                        onChange={(evento) =>
                          setHorasPorDia((atual) =>
                            atual.map((valor, indice) => (indice === dia ? evento.target.value : valor))
                          )
                        }
                        inputProps={{ min: 0, max: 24, step: 0.5, 'aria-label': 'Horas de ' + rotulo }}
                        disabled={pendente}
                        sx={{ width: 100 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        h
                      </Typography>
                    </Stack>
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    Dia zerado significa sem tempo livre naquele dia.
                  </Typography>
                </Stack>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditando(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={salvar} variant="contained" disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* -------- remover -------- */}
      <Dialog open={removendo} onClose={() => (pendente ? null : setRemovendo(false))}>
        <DialogTitle>Remover da casa?</DialogTitle>

        <DialogContent>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

          <DialogContentText>
            <strong>{member.user.name}</strong> perde o acesso à casa na hora. As tarefas que já
            executou continuam valendo no histórico e no placar.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setRemovendo(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={confirmarRemocao} color="error" variant="contained" disabled={pendente}>
            {pendente ? 'Aguarde…' : 'Remover'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* -------- sair -------- */}
      <Dialog open={saindo} onClose={() => (pendente ? null : setSaindo(false))}>
        <DialogTitle>Sair da casa?</DialogTitle>

        <DialogContent>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

          <DialogContentText>
            Você deixa de ver as tarefas e o placar desta casa. Para voltar vai precisar de um
            convite novo — seu histórico de execuções permanece.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setSaindo(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={confirmarSaida} color="error" variant="contained" disabled={pendente}>
            {pendente ? 'Aguarde…' : 'Sair'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
