// lib/device/push.ts
// Web Push no navegador: pedir permissão, inscrever o aparelho e remover a inscrição.
//
// O que este arquivo NÃO faz: decidir se o servidor tem VAPID. Isso é do
// GET /me/push/config, e sem ele não há o que inscrever — o canal push simplesmente
// não existe naquela instalação.
//
// Limites do navegador que valem saber:
//   - iOS/iPadOS 16.4+: só recebe push quando o app está INSTALADO na Tela de Início;
//   - Safari no Mac: 16.4+;
//   - Chrome/Edge/Firefox: desktop e Android;
//   - HTTPS é obrigatório (localhost é a exceção).

import type { ApiClient } from '@/lib/domain/api';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';

  // No iPhone, push só existe para o app instalado — e é melhor dizer isso do que
  // mostrar um botão que falha.
  if (ios && !standalone) return 'needs-install';

  return 'supported';
}

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'subscribed' | 'available';

export async function currentPushState(): Promise<PushState> {
  const suporte = pushSupport();
  if (suporte !== 'supported') return suporte;

  if (Notification.permission === 'denied') return 'denied';

  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = registro ? await registro.pushManager.getSubscription() : null;

  return inscricao ? 'subscribed' : 'available';
}

/** Converte a chave pública VAPID (base64url) no Uint8Array que o navegador exige. */
export function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = window.atob(normalizado);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));

  for (let i = 0; i < bruto.length; i += 1) {
    bytes[i] = bruto.charCodeAt(i);
  }

  return bytes;
}

export class PushError extends Error {
  readonly code: 'disabled' | 'unsupported' | 'needs-install' | 'denied' | 'failed';

  constructor(code: PushError['code'], message: string) {
    super(message);
    this.name = 'PushError';
    this.code = code;
  }
}

/**
 * Inscreve este aparelho. Registra o service worker se preciso — em desenvolvimento o
 * app não registra sozinho (para o cache não atrapalhar), mas o push precisa dele.
 */
export async function enablePush(api: ApiClient): Promise<void> {
  const suporte = pushSupport();

  if (suporte === 'needs-install') {
    throw new PushError(
      'needs-install',
      'No iPhone, instale o app na Tela de Início para receber notificações.'
    );
  }

  if (suporte === 'unsupported') {
    throw new PushError('unsupported', 'Este navegador não recebe notificações push.');
  }

  const config = await api.push.config();

  if (!config.enabled || !config.publicKey) {
    throw new PushError(
      'disabled',
      'O servidor não tem as chaves de push configuradas (VAPID).'
    );
  }

  const permissao = await Notification.requestPermission();

  if (permissao !== 'granted') {
    throw new PushError('denied', 'A permissão para notificações foi negada no navegador.');
  }

  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const existente = await registro.pushManager.getSubscription();
  const inscricao =
    existente ||
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.publicKey),
    }));

  const chaves = inscricao.toJSON().keys;

  await api.push.subscribe({
    endpoint: inscricao.endpoint,
    keys: {
      p256dh: chaves?.p256dh ?? '',
      auth: chaves?.auth ?? '',
    },
    userAgent: navigator.userAgent.slice(0, 300),
  });
}

/** Cancela a inscrição no navegador E no servidor. Idempotente. */
export async function disablePush(api: ApiClient): Promise<void> {
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = registro ? await registro.pushManager.getSubscription() : null;

  if (!inscricao) return;

  try {
    await api.push.unsubscribe(inscricao.endpoint);
  } finally {
    await inscricao.unsubscribe();
  }
}
