// components/auth/RegisterForm.tsx
// Criar a propria conta.
//
// A conta nasce SEM casa de proposito: quem tem um codigo de convite entra na casa de
// alguem; quem nao tem cria a sua, no proximo passo. Juntar as duas coisas num formulario
// so obrigaria todo mundo a decidir antes de saber o que quer.

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { getBrowserApi } from '@/lib/session/browser';

export default function RegisterForm() {
  const router = useRouter();

  const [campos, setCampos] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmacao: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function atualizar(campo: keyof typeof campos) {
    return (evento: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((atual) => ({ ...atual, [campo]: evento.target.value }));
  }

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErrosDeCampo({});

    // Conferido aqui e na API: aqui e para a pessoa nao perder o formulario preenchido,
    // la e porque o cliente nao e autoridade sobre nada.
    if (campos.password !== campos.confirmacao) {
      setErrosDeCampo({ confirmacao: 'As senhas não são iguais.' });
      return;
    }

    setEnviando(true);

    try {
      await getBrowserApi().auth.register({
        name: campos.name,
        username: campos.username,
        email: campos.email,
        password: campos.password,
      });

      // Conta criada, ainda sem casa: o onboarding decide o resto.
      router.replace('/onboarding');
      router.refresh();
    } catch (causa) {
      if (isApiError(causa)) {
        const porCampo: Record<string, string> = {};
        for (const problema of causa.details) porCampo[problema.field] = problema.issue;

        setErrosDeCampo(porCampo);
        setErro(messageFor(causa.code, causa.message));
      } else {
        setErro('Não conseguimos falar com o servidor. Tente novamente.');
      }

      setEnviando(false);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ display: 'flex', minHeight: '100dvh', alignItems: 'center' }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%' }}>
        <Typography variant="h2" component="h1" gutterBottom>
          Criar conta
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Depois de criar a conta você entra na sua casa com um código, ou cria uma nova.
        </Typography>

        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        <Box component="form" onSubmit={criar}>
          <Stack spacing={2}>
            <TextField
              label="Seu nome"
              value={campos.name}
              onChange={atualizar('name')}
              error={Boolean(errosDeCampo.name)}
              helperText={errosDeCampo.name}
              autoComplete="name"
              required
            />

            <TextField
              label="Nome de usuário"
              value={campos.username}
              onChange={atualizar('username')}
              error={Boolean(errosDeCampo.username)}
              helperText={errosDeCampo.username ?? 'Letras, números, ponto, hífen e underline.'}
              autoComplete="username"
              required
            />

            <TextField
              label="E-mail"
              type="email"
              value={campos.email}
              onChange={atualizar('email')}
              error={Boolean(errosDeCampo.email)}
              helperText={errosDeCampo.email}
              autoComplete="email"
              required
            />

            <TextField
              label="Senha"
              type="password"
              value={campos.password}
              onChange={atualizar('password')}
              error={Boolean(errosDeCampo.password)}
              helperText={errosDeCampo.password ?? 'Pelo menos 8 caracteres.'}
              autoComplete="new-password"
              required
            />

            <TextField
              label="Repita a senha"
              type="password"
              value={campos.confirmacao}
              onChange={atualizar('confirmacao')}
              error={Boolean(errosDeCampo.confirmacao)}
              helperText={errosDeCampo.confirmacao}
              autoComplete="new-password"
              required
            />

            <Button type="submit" variant="contained" size="large" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar conta'}
            </Button>
          </Stack>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Já tem conta? <Link href="/login">Entrar</Link>
        </Typography>
      </Paper>
    </Container>
  );
}
