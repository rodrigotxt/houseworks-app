// components/household/InviteCard.tsx
// O codigo de convite: o que ele e, ate quando vale, e como gerar outro.
//
// O codigo e a UNICA porta de entrada na casa alem do dono. Por isso ele aparece em
// destaque, com a validade ao lado -- e rotacionar pede confirmacao, porque invalida o
// codigo que ja foi passado para alguem.

'use client';

import { useState, useTransition } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { rotateInvite } from '@/app/(app)/household/actions';
import { formatInstant } from '@/lib/domain/dates';

interface InviteCardProps {
  code: string;
  expiresAt: string;
  timeZone: string;
  canRotate: boolean;
}

export default function InviteCard({ code, expiresAt, timeZone, canRotate }: InviteCardProps) {
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissao de area de transferencia (ou contexto inseguro): o codigo esta na
      // tela e da para ler. Nao vale interromper o usuario com um erro por isso.
      setCopiado(false);
    }
  }

  function rotacionar() {
    setErro(null);

    iniciar(async () => {
      const resultado = await rotateInvite();

      if (resultado.status === 'error') {
        setErro(resultado.message ?? null);
        return;
      }

      setConfirmando(false);
    });
  }

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" component="h3" gutterBottom>
          Convidar para a casa
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Quem receber este código entra pela tela de convite e passa a ver as tarefas da casa.
        </Typography>

        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <Box
            sx={{
              px: 3,
              py: 1.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Typography
              variant="h5"
              component="p"
              sx={{ fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}
            >
              {code}
            </Typography>
          </Box>

          <Button variant="outlined" onClick={copiar}>
            {copiado ? 'Copiado!' : 'Copiar'}
          </Button>

          {canRotate && (
            <Button color="warning" onClick={() => setConfirmando(true)} disabled={pendente}>
              Gerar código novo
            </Button>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Válido até {formatInstant(expiresAt, timeZone)}.
        </Typography>
      </CardContent>

      <Dialog open={confirmando} onClose={() => (pendente ? null : setConfirmando(false))}>
        <DialogTitle>Gerar um código novo?</DialogTitle>

        <DialogContent>
          <DialogContentText>
            O código atual para de funcionar imediatamente. Quem já entrou com ele continua na
            casa — só quem ainda não usou é que precisa do novo.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setConfirmando(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={rotacionar} color="warning" variant="contained" disabled={pendente}>
            {pendente ? 'Gerando…' : 'Gerar novo'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
