// app/manifest.ts
// O manifest que torna o app INSTALÁVEL no celular.
//
// O Next serve este arquivo em /manifest.webmanifest, que é o caminho declarado no
// metadata do layout raiz.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HouseWorks — tarefas da casa',
    short_name: 'HouseWorks',
    description: 'As tarefas da casa, divididas e acompanhadas.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f6f7f8',
    theme_color: '#0f766e',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O maskable precisa do desenho dentro da zona segura: o Android recorta o icone
      // em circulo, quadrado ou gota, conforme o launcher.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
