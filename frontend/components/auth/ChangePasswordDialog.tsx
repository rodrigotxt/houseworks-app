// components/auth/ChangePasswordDialog.tsx
// Trocar a propria senha.
//
// FALA COM A API PELO BROWSER, e nao por Server Action — pelo mesmo motivo do login: quem
// grava o cookie novo e a propria API, na resposta. Uma Server Action rodaria no servidor e
// o Set-Cookie nao chegaria ao navegador, deixando a sessao antiga (ja invalida) no lugar.

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { getBrowserApi } from '@/lib/session/browser';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const router = useRouter();

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function limpar() {
    setAtual('');
    setNova('');
    setConfirmacao('');
    setErro(null);
    setPronto(false);
    setEnviando(false);
  }

  function fechar() {
    limpar();
    onClose();
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (nova !== confirmacao) {
      setErro('As senhas novas não são iguais.');
      return;
    }

    setEnviando(true);

    try {
      await getBrowserApi().auth.changePassword({
        currentPassword: atual,
        newPassword: nova,
      });

      // A API ja gravou o cookie novo na resposta. O refresh garante que os componentes
      // de servidor desta tela passem a usar a sessao nova.
      setPronto(true);
      setEnviando(false);
      router.refresh();
    } catch (causa) {
      setErro(
        isApiError(causa)
          ? messageFor(causa.code, causa.message)
          : 'Não conseguimos falar com o servidor. Tente novamente.'
      );
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => (enviando ? null : fechar())} fullWidth maxWidth="xs">
      <DialogTitle>Trocar senha</DialogTitle>

      {pronto ? (
        <>
          <DialogContent>
            <Alert severity="success">
              Senha trocada. As outras sessões abertas foram encerradas — só esta continua.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={fechar} variant="contained">Entendi</Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={salvar}>
          <DialogContent>
            {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

            <DialogContentText sx={{ mb: 2 }}>
              Ao trocar a senha, as sessões abertas em outros aparelhos são encerradas.
            </DialogContentText>

            <Stack spacing={2}>
              <TextField
                label="Senha atual"
                type="password"
                value={atual}
                onChange={(evento) => setAtual(evento.target.value)}
                autoComplete="current-password"
                required
                autoFocus
              />

              <TextField
                label="Nova senha"
                type="password"
                value={nova}
                onChange={(evento) => setNova(evento.target.value)}
                helperText="Pelo menos 8 caracteres."
                autoComplete="new-password"
                required
              />

              <TextField
                label="Repita a nova senha"
                type="password"
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                autoComplete="new-password"
                required
              />
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={fechar} disabled={enviando}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={enviando}>
              {enviando ? 'Trocando…' : 'Trocar'}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}
