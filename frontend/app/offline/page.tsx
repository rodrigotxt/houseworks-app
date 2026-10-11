// app/offline/page.tsx
// Para onde o service worker manda quando não há rede e a página não está em cache.

import type { Metadata } from 'next';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

export const metadata: Metadata = { title: 'Sem conexão' };

export default function OfflinePage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ textAlign: 'center', py: 12 }}>
        <Typography variant="h1" gutterBottom>
          Você está sem conexão
        </Typography>
        <Typography variant="body1" color="text.secondary">
          As tarefas ficam no servidor da casa. Assim que a internet voltar, é só recarregar.
        </Typography>
      </Box>
    </Container>
  );
}
