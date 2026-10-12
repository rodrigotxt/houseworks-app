// components/auth/LoginForm.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { getBrowserApi } from '@/lib/session/browser';

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      // A API grava o cookie httpOnly; não guardamos token nenhum no cliente.
      await getBrowserApi().auth.login({ email, password });
      router.replace('/tasks');
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
    <Container maxWidth="xs" sx={{ display: 'flex', minHeight: '100dvh', alignItems: 'center' }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%' }}>
        <Typography variant="h1" gutterBottom sx={{ fontSize: '1.5rem' }}>
          HouseWorks
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Entre para ver as tarefas da sua casa.
        </Typography>

        <Box component="form" onSubmit={entrar} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {erro && <Alert severity="error">{erro}</Alert>}

          <TextField
            label="E-mail"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            autoComplete="email"
            required
            fullWidth
            autoFocus
          />

          <TextField
            label="Senha"
            type="password"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />

          <Button type="submit" variant="contained" size="large" disabled={enviando} fullWidth>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Ainda não tem conta? <Link href="/register">Criar uma</Link>
        </Typography>
      </Paper>
    </Container>
  );
}
