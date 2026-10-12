// components/household/CreateMemberCard.tsx
// Cadastrar uma pessoa que ainda NAO tem conta.
//
// Fica ao lado do cartao de convite de proposito: os dois trazem gente para a casa, e a
// diferenca entre eles e a unica coisa que quem esta usando precisa entender —
//   codigo  -> a pessoa ja tem conta e vai entrar sozinha;
//   cadastro -> a pessoa nao tem conta, e alguem cria para ela.
//
// O cartao diz isso em texto, porque a tela nao tem como adivinhar qual e o caso.

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
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { createMember } from '@/app/(app)/household/actions';
import { ROLE_HINTS, ROLE_LABELS } from '@/lib/domain/labels';
import type { Role } from '@/lib/domain/rules';

const VAZIO = { name: '', username: '', email: '', password: '' };

export default function CreateMemberCard() {
  const [aberto, setAberto] = useState(false);
  const [campos, setCampos] = useState(VAZIO);
  const [papel, setPapel] = useState<Role>('child');
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [criada, setCriada] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function atualizar(campo: keyof typeof VAZIO) {
    return (evento: React.ChangeEvent<HTMLInputElement>) =>
      setCampos((atual) => ({ ...atual, [campo]: evento.target.value }));
  }

  function abrir() {
    setCampos(VAZIO);
    setPapel('child');
    setErro(null);
    setErrosDeCampo({});
    setCriada(null);
    setAberto(true);
  }

  function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErrosDeCampo({});

    iniciar(async () => {
      const resultado = await createMember({
        name: campos.name,
        username: campos.username,
        email: campos.email,
        password: campos.password,
        role: papel,
      });

      if (resultado.status === 'error') {
        setErro(resultado.message ?? null);
        setErrosDeCampo(resultado.fieldErrors ?? {});
        return;
      }

      // A senha foi escolhida aqui, entao quem cadastrou precisa entrega-la.
      setCriada(campos.name);
    });
  }

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" component="h3" gutterBottom>
          Cadastrar uma pessoa
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Para quem ainda <strong>não tem conta</strong> — uma criança, por exemplo. Você escolhe
          a senha e entrega a ela, que pode trocar depois. Se a pessoa já tem conta, use o
          código de convite acima.
        </Typography>

        <Button variant="outlined" onClick={abrir}>
          Cadastrar pessoa
        </Button>
      </CardContent>

      <Dialog open={aberto} onClose={() => (pendente ? null : setAberto(false))} fullWidth maxWidth="sm">
        <DialogTitle>Cadastrar uma pessoa</DialogTitle>

        {criada ? (
          <>
            <DialogContent>
              <Alert severity="success" sx={{ mb: 2 }}>
                <strong>{criada}</strong> já é membro da casa.
              </Alert>
              <DialogContentText>
                Anote a senha que você escolheu e entregue a ela. No primeiro acesso, ela pode
                trocar em <strong>Trocar senha</strong>, no menu da sua conta — e nesse momento
                você deixa de conhecê-la.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAberto(false)} variant="contained">Entendi</Button>
            </DialogActions>
          </>
        ) : (
          <Box component="form" onSubmit={cadastrar}>
            <DialogContent>
              {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

              <Stack spacing={2}>
                <TextField
                  label="Nome"
                  value={campos.name}
                  onChange={atualizar('name')}
                  error={Boolean(errosDeCampo.name)}
                  helperText={errosDeCampo.name}
                  required
                  autoFocus
                />

                <TextField
                  label="Nome de usuário"
                  value={campos.username}
                  onChange={atualizar('username')}
                  error={Boolean(errosDeCampo.username)}
                  helperText={errosDeCampo.username ?? 'Como a pessoa entra no login.'}
                  required
                />

                <TextField
                  label="E-mail"
                  type="email"
                  value={campos.email}
                  onChange={atualizar('email')}
                  error={Boolean(errosDeCampo.email)}
                  helperText={errosDeCampo.email}
                  required
                />

                <TextField
                  label="Senha provisória"
                  type="text"
                  value={campos.password}
                  onChange={atualizar('password')}
                  error={Boolean(errosDeCampo.password)}
                  helperText={errosDeCampo.password ?? 'Pelo menos 8 caracteres. Entregue a ela.'}
                  required
                />

                <TextField
                  select
                  label="Papel na casa"
                  value={papel}
                  onChange={(evento) => setPapel(evento.target.value as Role)}
                  helperText={ROLE_HINTS[papel]}
                >
                  {(['adult', 'child', 'owner'] as Role[]).map((opcao) => (
                    <MenuItem key={opcao} value={opcao}>
                      {ROLE_LABELS[opcao]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </DialogContent>

            <DialogActions>
              <Button onClick={() => setAberto(false)} disabled={pendente}>Cancelar</Button>
              <Button type="submit" variant="contained" disabled={pendente}>
                {pendente ? 'Cadastrando…' : 'Cadastrar'}
              </Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </Card>
  );
}
