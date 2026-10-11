// lib/session/config.ts
// Endereco da API visto pelo BROWSER.
//
// Variavel NEXT_PUBLIC_ porque o valor e embutido no bundle em tempo de build — o
// browser precisa saber para onde chamar. O endereco interno (usado no servidor, dentro
// da rede do Docker) fica em lib/session/server.ts, que nunca chega ao cliente.

/**
 * Onde a API esta, SEM o prefixo de versao — quem acrescenta /api/v1 e o cliente
 * (lib/domain/api/client.ts). Ex.: http://localhost:3001
 */
export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
