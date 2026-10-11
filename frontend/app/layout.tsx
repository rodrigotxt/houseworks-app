// app/layout.tsx
// Layout raiz: só o documento e os providers. Nada de navegação aqui — quem decide a
// navegação é o layout de cada grupo de rotas, porque ela muda por dispositivo.

import type { Metadata, Viewport } from 'next';

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';

import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import Providers from '@/components/ui/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'HouseWorks', template: '%s · HouseWorks' },
  description: 'As tarefas da casa, divididas e acompanhadas.',
  applicationName: 'HouseWorks',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'HouseWorks', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Ocupa a área toda inclusive atrás do notch, para o app instalado não parecer uma página.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1416' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script abaixo escreve o atributo de tema no <html> antes
    // de o React hidratar, e sem isto o React reclamaria da diferença.
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {/*
          Roda ANTES da primeira pintura e escreve o tema escolhido no <html>.
          Sem ele o servidor manda claro (não tem como saber a preferência do sistema), o
          navegador pinta claro e só depois o React troca para escuro — que é exatamente a
          piscada. São ~2KB inline e resolve o problema na raiz.
        */}
        <InitColorSchemeScript defaultMode="system" />

        <Providers>{children}</Providers>
        {/* Torna o app instalável no celular. Não renderiza nada. */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
