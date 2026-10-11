// app/(app)/error.tsx
// Um erro inesperado (a API fora do ar, por exemplo) não pode virar tela branca.

'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Typography variant="h2" gutterBottom>
        Não conseguimos carregar esta tela
      </Typography>

      <Alert severity="error" sx={{ mb: 3 }}>
        {error.message}
      </Alert>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" onClick={reset}>Tentar de novo</Button>
        <Button href="/tasks">Voltar para as tarefas</Button>
      </Box>
    </Container>
  );
}
