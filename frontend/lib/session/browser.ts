// lib/session/browser.ts
// Acesso a API a partir do BROWSER (Client Components).
//
// O cookie httpOnly viaja sozinho desde que a requisicao use credentials: 'include'.

import { createApiClient, type ApiClient } from '@/lib/domain/api';
import { PUBLIC_API_URL } from './config';

let singleton: ApiClient | null = null;

// Cliente separado para renovar a sessao, SEM o gancho de renovacao.
// Sem isto seria recursivo: o refresh receberia 401 e tentaria renovar a si mesmo.
const renovador = createApiClient({
  baseUrl: PUBLIC_API_URL,
  credentials: 'include',
});

let renovacaoEmAndamento: Promise<boolean> | null = null;

/**
 * Renova a sessao UMA vez, compartilhando a promessa entre chamadas simultaneas.
 *
 * O refresh ROTACIONA o token: a API revoga o apresentado e emite outro. Duas chamadas
 * paralelas fariam a segunda receber 401 e derrubar a sessao. Por isso uma promessa so,
 * limpa assim que termina.
 */
function renovarSessao(): Promise<boolean> {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = (async () => {
      try {
        await renovador.auth.refresh();
        return true;
      } catch {
        return false;
      } finally {
        renovacaoEmAndamento = null;
      }
    })();
  }

  return renovacaoEmAndamento;
}

export function getBrowserApi(): ApiClient {
  if (!singleton) {
    singleton = createApiClient({
      baseUrl: PUBLIC_API_URL,
      credentials: 'include',
      onTokenExpired: renovarSessao,
    });
  }

  return singleton;
}

export { renovarSessao };
