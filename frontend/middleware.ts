// middleware.ts
// Renova a sessao ANTES do render.
//
// POR QUE AQUI, e nao no cliente. Quase tudo neste app e renderizado no servidor: o cookie
// e repassado a API a cada navegacao. Quando o token expira, a API responde 401 na PRIMEIRA
// requisicao — o render nem chega a acontecer, e o usuario e mandado para o login. O
// `onTokenExpired` do cliente so roda em chamadas feitas pelo NAVEGADOR (login, cadastro,
// troca de senha), ou seja, nunca nas telas de dados. Era por isso que a sessao morria em
// uma hora, sem nada para reaviva-la.
//
// O middleware e o unico lugar que roda antes do render E pode gravar cookie.

import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'jwt_token';

/**
 * Renova quando faltar menos que isto para expirar.
 *
 * Sem a margem, o token poderia expirar entre esta checagem e a chamada da API, e a
 * requisicao que motivou a renovacao ainda cairia no 401.
 */
const MARGEM_SEGUNDOS = 5 * 60;

/** Para onde falar com a API de dentro do servidor (no Docker, o nome do servico). */
const API = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');

/**
 * Le o `exp` do token sem verificar a assinatura.
 *
 * Aqui NAO se decide nada a partir disso: e so para saber se vale a pena renovar. Quem
 * verifica a assinatura e a API, sempre.
 */
function expiracao(token: string): number | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;

  // Sem token, ou sem endereco da API configurado: nao ha o que renovar. Segue o fluxo
  // normal, que manda para o login.
  if (!token || !API) return NextResponse.next();

  const exp = expiracao(token);
  if (!exp) return NextResponse.next();

  const agora = Math.floor(Date.now() / 1000);

  // O caminho comum: token com folga. Uma decodificacao e nada mais.
  if (exp - agora > MARGEM_SEGUNDOS) return NextResponse.next();

  let resposta: Response;
  try {
    resposta = await fetch(API + '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: COOKIE + '=' + token },
    });
  } catch {
    // API fora do ar nao pode derrubar a navegacao: o fluxo normal decide o que fazer.
    return NextResponse.next();
  }

  if (!resposta.ok) return NextResponse.next();

  const corpo = await resposta.json().catch(() => null);
  const novo: string | undefined = corpo && corpo.data && corpo.data.token;
  if (!novo) return NextResponse.next();

  // A REQUEST desta mesma requisicao precisa ver o token novo. Sem isto, o render logo
  // abaixo usaria o token velho, receberia 401 e mandaria para o login — antes de o
  // navegador ter chance de guardar o cookie novo.
  const cabecalhos = new Headers(req.headers);
  const cookies = (cabecalhos.get('cookie') || '')
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte && !parte.startsWith(COOKIE + '='));

  // Preserva os DEMAIS cookies: `hw_household` guarda a casa ativa, e reescrever o cabecalho
  // inteiro a apagaria a cada renovacao.
  cookies.push(COOKIE + '=' + novo);
  cabecalhos.set('cookie', cookies.join('; '));

  const saida = NextResponse.next({ request: { headers: cabecalhos } });

  // Repassa o Set-Cookie da API em vez de reescrever as flags aqui: httpOnly, secure,
  // sameSite e a validade da sessao sao decisao dela, e duplicar isso criaria duas verso es
  // da mesma regra, prontas para divergir.
  const setCookie = resposta.headers
    .getSetCookie()
    .find((linha) => linha.startsWith(COOKIE + '='));

  if (setCookie) saida.headers.append('set-cookie', setCookie);

  return saida;
}

export const config = {
  // Fora o que e estatico: renovar a cada arquivo do bundle seria uma chamada a API por
  // requisicao, sem nada a ganhar.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|manifest.webmanifest).*)'],
};
