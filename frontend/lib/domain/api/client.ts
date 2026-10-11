// lib/domain/api/client.ts
// O unico lugar que fala HTTP com a API.
//
// Nao conhece React, Next nem MUI — roda igual no servidor (com o cookie repassado)
// e no browser (com credentials: 'include'). Essa e a razao de o dominio ser puro:
// e o que permitiria um app nativo amanha sem reescrever regra nenhuma.

import { ApiError } from './errors';
import type { PageMeta } from './types';

export type QueryValue = string | number | boolean | undefined | null;

/**
 * A versao da API vive AQUI, nao na configuracao.
 *
 * A variavel de ambiente diz ONDE a API esta (http://localhost:3001); qual versao do
 * contrato consumir e detalhe do codigo. Se estivesse no ambiente, todo mundo que
 * configurasse o host esqueceria o sufixo — e o erro seria um 404 de rota inexistente,
 * que nao aponta para a causa.
 */
export const API_PREFIX = '/api/v1';

/** Normaliza a raiz: tolera barra no fim e quem configurou a base ja com o prefixo. */
export function apiRoot(baseUrl: string): string {
  const limpo = baseUrl.replace(/\/+$/, '');
  return limpo.endsWith(API_PREFIX) ? limpo : limpo + API_PREFIX;
}

export interface ApiClientOptions {
  /** Endereco da API visto por QUEM CHAMA (no servidor, o endereco interno). */
  baseUrl: string;
  /** No servidor: o header Cookie da requisicao original, repassado adiante. */
  cookie?: string | null;
  /** No browser: 'include', para o cookie httpOnly viajar junto. */
  credentials?: RequestCredentials;
  /** Injetavel para teste. */
  fetchImpl?: typeof fetch;
  /**
   * Chamado quando a API responde 401 de token expirado.
   * Deve devolver true se conseguiu renovar — a requisicao e repetida uma vez.
   */
  onTokenExpired?: () => Promise<boolean>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /**
   * Aceita qualquer objeto — e nao `Record<string, QueryValue>` — porque uma `interface`
   * do TypeScript nao ganha index signature implicita. Exigir o Record obrigaria cada
   * recurso a espalhar um cast sem ganhar nada: a checagem que importa acontece antes,
   * na funcao do recurso, onde o tipo da query e declarado.
   */
  query?: object;
  signal?: AbortSignal;
}

export function buildQuery(query?: object): string {
  if (!query) return '';

  const params = new URLSearchParams();

  for (const [chave, valor] of Object.entries(query as Record<string, QueryValue>)) {
    if (valor === undefined || valor === null || valor === '') continue;
    params.set(chave, String(valor));
  }

  const texto = params.toString();
  return texto ? '?' + texto : '';
}

export function createTransport(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function send(path: string, init: RequestOptions, tentativa: number): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // No servidor o cookie nao viaja sozinho: precisa ser repassado a mao.
    if (options.cookie) {
      headers.Cookie = options.cookie;
    }

    let resposta: Response;

    try {
      resposta = await fetchImpl(apiRoot(options.baseUrl) + path + buildQuery(init.query), {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: options.credentials,
        signal: init.signal,
        cache: 'no-store',
      });
    } catch (causa) {
      throw ApiError.fromUnexpected(
        0,
        causa instanceof Error ? causa.message : 'Falha de rede ao falar com a API.'
      );
    }

    if (resposta.status === 204) {
      return undefined;
    }

    const texto = await resposta.text();
    let corpo: unknown = undefined;

    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        throw ApiError.fromUnexpected(resposta.status, 'A API respondeu algo que nao e JSON.');
      }
    }

    if (!resposta.ok) {
      const erro = ApiError.isErrorBody(corpo)
        ? ApiError.fromBody(resposta.status, corpo)
        : ApiError.fromUnexpected(resposta.status, 'Erro inesperado da API.');

      // Token expirado, uma unica vez: renova e repete. O refresh rotaciona o token,
      // entao tentar de novo as cegas em laco derrubaria a sessao.
      if (erro.code === 'TOKEN_EXPIRED' && tentativa === 0 && options.onTokenExpired) {
        const renovou = await options.onTokenExpired();
        if (renovou) return send(path, init, 1);
      }

      throw erro;
    }

    return corpo;
  }

  return {
    request<T>(path: string, init: RequestOptions = {}): Promise<T> {
      return send(path, init, 0) as Promise<T>;
    },
  };
}

export type Transport = ReturnType<typeof createTransport>;

/** Desembrulha { data } / { data, meta } sem repetir o formato em cada recurso. */
export function unwrap<T>(corpo: { data: T }): T {
  return corpo.data;
}

export function unwrapPage<T>(corpo: { data: T[]; meta: PageMeta }) {
  return { items: corpo.data, meta: corpo.meta };
}
