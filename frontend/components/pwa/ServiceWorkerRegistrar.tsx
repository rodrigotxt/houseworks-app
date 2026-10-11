// components/pwa/ServiceWorkerRegistrar.tsx
// Registra o service worker. Sem isto o app não é instalável.

'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch((erro) => {
        // Falhar aqui não pode quebrar o app: sem service worker ele funciona, só não
        // é instalável.
        console.warn('Service worker não registrado:', erro);
      });
    };

    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }, []);

  return null;
}
