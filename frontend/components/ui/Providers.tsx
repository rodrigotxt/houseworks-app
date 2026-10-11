// components/ui/Providers.tsx
// Providers globais do cliente: cache de estilo do MUI para o App Router e o tema.
//
// O AppRouterCacheProvider substitui o registro de Emotion escrito a mao que existia
// antes (components/MuiRegistry.js) — e o pacote oficial, mantido junto com o MUI.

'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';

import { appTheme } from './theme';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={appTheme} defaultMode="system">
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
