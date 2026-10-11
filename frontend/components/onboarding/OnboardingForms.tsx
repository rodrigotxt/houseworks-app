// components/onboarding/OnboardingForms.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { isApiError } from '@/lib/domain/api';
import { messageFor } from '@/lib/domain/labels';
import { getBrowserApi } from '@/lib/session/browser';

export default function OnboardingForms({ userName }: { userName: string }) {
  const router = useRouter();

  const [nomeCasa, setNomeCasa] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'criar' | 'entrar' | null>(null);

  function falhou(causa: unknown) {
    setErro(
      isApiError(causa)
        ? messageFor(causa.code, causa.message)
        : 'Não conseguimos falar com o servidor.'
    );
    setOcupado(null);
  }

  function concluir() {
    // O layout lê a casa das memberships; basta recarregar do servidor.
    router.replace('/tasks');
    router.refresh();
  }

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setOcupado('criar');

    try {
      await getBrowserApi().households.create({ name: nomeCasa });
      concluir();
    } catch (causa) {
      falhou(causa);
    }
  }

  async function entrarNaCasa(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setOcupado('entrar');

    try {
      await getBrowserApi().households.join({ inviteCode: codigo.trim().toUpperCase() });
      concluir();
    } catch (causa) {
      falhou(causa);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Typography variant="h1" gutterBottom>
        Olá, {userName.split(' ')[0]}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Você ainda não faz parte de nenhuma casa. Crie a sua ou entre com um código de convite.
      </Typography>

      {erro && <Alert severity="error" sx={{ mb: 3 }}>{erro}</Alert>}

      <Stack spacing={3}>
        <Card>
          <CardContent>
            <Typography variant="h2" gutterBottom sx={{ fontSize: '1.15rem' }}>
              Criar uma casa
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Você vira o responsável e recebe um código para convidar a família.
            </Typography>

            <Box component="form" onSubmit={criar} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                label="Nome da casa"
                placeholder="Casa dos Martins"
                value={nomeCasa}
                onChange={(evento) => setNomeCasa(evento.target.value)}
                required
                sx={{ flexGrow: 1, minWidth: 200 }}
              />
              <Button type="submit" variant="contained" disabled={ocupado !== null}>
                {ocupado === 'criar' ? 'Criando…' : 'Criar'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h2" gutterBottom sx={{ fontSize: '1.15rem' }}>
              Entrar com um convite
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Peça o código de 8 caracteres a quem já está na casa.
            </Typography>

            <Box component="form" onSubmit={entrarNaCasa} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                label="Código de convite"
                value={codigo}
                onChange={(evento) => setCodigo(evento.target.value)}
                inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 2 } }}
                required
                sx={{ flexGrow: 1, minWidth: 200 }}
              />
              <Button type="submit" variant="outlined" disabled={ocupado !== null}>
                {ocupado === 'entrar' ? 'Entrando…' : 'Entrar'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
