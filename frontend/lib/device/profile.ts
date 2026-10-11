// lib/device/profile.ts
// Que tipo de aparelho esta do outro lado.
//
// Isto e uma PISTA, nao uma verdade: o user agent erra, e um tablet pode ser usado na
// vertical como um celular. Por isso o servidor usa isto apenas para escolher o shell
// INICIAL (evitando piscar o layout errado) e o cliente pode refinar pelo tamanho real
// da janela.

export type DeviceKind = 'tv' | 'mobile' | 'tablet' | 'desktop';

// TV primeiro: um navegador de smart TV costuma se anunciar como Android ou Linux, entao
// testar "mobile" antes dele classificaria a TV como celular.
const TV =
  /smart-?tv|smarttv|tizen|web0s|webos|netcast|viera|bravia|hbbtv|appletv|googletv|android ?tv|aft[bmst]|roku|crkey|dlnadoc|hisense|philips.?tv|opera ?tv/i;

const TABLET = /ipad|tablet|playbook|silk|kindle|(android(?!.*mobile))/i;

const MOBILE = /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile|mobile/i;

export function deviceFromUserAgent(userAgent: string | null | undefined): DeviceKind {
  // Sem user agent (prerender, teste, curl): o alvo mais completo.
  if (!userAgent) return 'desktop';

  if (TV.test(userAgent)) return 'tv';
  if (TABLET.test(userAgent)) return 'tablet';
  if (MOBILE.test(userAgent)) return 'mobile';
  return 'desktop';
}

/**
 * Refinamento no cliente, a partir do que o navegador sabe de verdade.
 * A TV fica de fora: uma TV tambem e uma tela grande, e o que a distingue e a ENTRADA
 * (controle remoto), nao o tamanho.
 */
export function deviceFromViewport(width: number): DeviceKind {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Modo TV forcado por URL — util para testar sem uma TV. */
export function isTvRequest(searchParam?: string | null): boolean {
  return searchParam === '1' || searchParam === 'true';
}
