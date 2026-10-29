# Guia de integração — o que o frontend precisa saber

Escrito para quem vai construir a UI (humano ou IA) contra esta API. O contrato formal é
[openapi.yaml](./openapi.yaml); aqui está o que ele não conta: a ordem das chamadas, como reagir a
cada erro e as armadilhas.

> **Base URL:** `NEXT_PUBLIC_API_BASE_URL` (no compose, `http://localhost:3001`) + `/api/v1`.
> O prefixo `/api` sem versão continua funcionando como alias legado — **não use em código novo**.

---

## 1. Autenticação

### Como a sessão viaja

O login **grava um cookie httpOnly `jwt_token`**. É ele que carrega a sessão no browser — não é
preciso mexer em `localStorage` nem mandar header `Authorization` em cada chamada.

```ts
// O browser envia o cookie sozinho desde que a requisição use credentials.
await fetch(`${BASE}/api/v1/households/${id}/tasks`, { credentials: 'include' });
```

O backend também aceita `Authorization: Bearer <jwt>` (clientes não-browser) e o header legado
`x-auth-token`. Para o browser, **use o cookie** — ele é imune a XSS.

### Fluxo completo

```
POST /auth/register       { name, username, email, password [, householdName] }
  → 201 { data: { user[, household] } }
  → 409 EMAIL_ALREADY_REGISTERED | USERNAME_ALREADY_REGISTERED
  SEM householdName, cria a conta e MAIS NADA — a casa vem depois (convite ou criação).

POST /auth/login          { email | username, password }
  → 200 { data: { token, expiresIn, user } }   + Set-Cookie: jwt_token (httpOnly)
  → 401 INVALID_CREDENTIALS
  → 429 RATE_LIMITED

PATCH /auth/password      { currentPassword, newPassword }
  → 200 { data: { token, expiresIn } }   + Set-Cookie novo
  → 401 INVALID_CREDENTIALS   (senha atual errada)
  DERRUBA todas as outras sessões: qualquer token emitido antes da troca deixa de valer.
  Por isso devolve um token novo — o que fez a chamada também acabou de expirar.

GET  /auth/me
  → 200 { data: { user, memberships: [{ id, householdId, role, capabilities }] } }
  → 401  (sessão inválida/expirada → manda para o login)

POST /auth/logout         → 204 (revoga o token e limpa o cookie)
POST /auth/refresh        → 200 { data: { token, expiresIn } }   (rotaciona)
```

**`expiresIn` é em segundos** (1h por padrão). Quando uma chamada voltar `401 TOKEN_EXPIRED`,
chame `POST /auth/refresh` **uma vez** e repita a requisição; se o refresh também falhar, vá para o
login. Não fique em laço.

> `POST /auth/refresh` **rotaciona**: o token antigo é revogado. Duas renovações simultâneas com o
> mesmo token fazem a segunda receber `401` — o front deve serializar o refresh (uma promessa
> compartilhada), não disparar vários em paralelo.

### O que **não** fazer

O `lib/auth.tsx` atual decodifica o JWT localmente para descobrir o usuário. **Isso deve sair:**
o token é opaco para o cliente, não carrega papel nem casa, e decodificar no browser não é
validação nenhuma. Use `GET /auth/me`.

O `middleware.ts` pode continuar checando **a presença** do cookie para decidir o redirecionamento
— isso é só navegação, não autorização. Quem autoriza é o backend.

---

## 2. O envelope

**Sucesso:** sempre `{ data } `, e `{ data, meta }` nas listagens.

```json
// item
{ "data": { "id": "...", "name": "Limpar banheiro" } }

// lista paginada
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 31, "totalPages": 2 } }
```

**Erro:** sempre `{ error }`, sem exceção — inclusive 429 e 500.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Um ou mais campos sao invalidos.",
    "details": [{ "field": "password", "issue": "Senha deve ter no minimo 8 caracteres." }],
    "requestId": "6f1c2b1e-6c1a-4c1e-9f2a-2f2f9a1b7c33"
  }
}
```

**Decida pelo `code`, nunca pelo texto.** A mensagem pode mudar (ou ser traduzida) sem aviso; o
código é o contrato. Guarde o `requestId` em qualquer tela de erro — é o que correlaciona com o log
do servidor. Ele também vem no header `X-Request-Id` (exposto no CORS).

---

## 3. Como reagir a cada erro

| Status | Código | O que fazer |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Mapear `details[].field` para os campos do formulário |
| 400 | `INVALID_DATE_RANGE` | Avisar sobre o intervalo escolhido |
| 401 | `UNAUTHENTICATED` / `TOKEN_INVALID` | Sessão acabou: mandar para o login |
| 401 | `TOKEN_EXPIRED` | Tentar `POST /auth/refresh` **uma vez**, depois repetir a chamada |
| 401 | `INVALID_CREDENTIALS` | Erro do formulário de login |
| 403 | `INSUFFICIENT_ROLE` | Explicar que o papel não permite; **esconder a ação** quando der para prever |
| 403 | `NOT_HOUSEHOLD_MEMBER` | Você não é desta casa; voltar para a seleção de casa |
| 403 | `CANNOT_RATE_OWN_EXECUTION` | Esperado: quem executou não avalia. Não ofereça o botão |
| 404 | `*_NOT_FOUND` | Recurso sumiu ou é de outra casa: voltar para a lista |
| 409 | `OCCURRENCE_ALREADY_COMPLETED`, `EXECUTION_ALREADY_RATED` | Alguém chegou antes: recarregar |
| 409 | `LAST_OWNER_CANNOT_LEAVE` | A casa precisa de um owner |
| 429 | `RATE_LIMITED` | Esperar e avisar. O header `Retry-After` diz quantos segundos |
| 500 | `INTERNAL_ERROR` | Erro nosso: mostrar o `requestId` e pedir para tentar de novo |

**Prever pelo `capabilities`, não pela tentativa.** A `Membership` devolve o que o usuário pode
fazer (`canManageTasks`, `canAssign`, `canRate`, `canManageMembers`). Use isso para **esconder ou
desabilitar** botões. O backend continua validando — a UI só evita frustração.

---

## 4. Sequência de inicialização

```
1. GET /auth/me
     └─ 401 → tela de login
2. memberships vazio?
     └─ sim → onboarding: POST /households (criar) ou POST /households/join (código de convite)
3. Escolher a casa atual e guardar o householdId
     └─ o token NÃO carrega a casa: o front precisa dessa noção de "casa atual"
        (é o único estado de sessão que o front gerencia)
4. Carregar a tela pedida
```

> **Se você só está em uma casa, ainda assim guarde o `householdId`** — todas as rotas de dados o
> exigem no caminho. Um dia o app pode ter mais de uma.

---

## 5. As telas e seus endpoints

### Entrar na casa — os dois caminhos

| Caminho | Para quem | Como |
|---|---|---|
| **Cadastro + código** | a pessoa tem como se cadastrar sozinha | `POST /auth/register` **sem** `householdName` → a conta nasce sem casa → `POST /households/join` com o código |
| **O dono cadastra** | criança, ou quem não vai fazer isso sozinho | `POST /households/{householdId}/members` — cria usuário **e** membership numa chamada (exige `owner`) |

Os dois coexistem e resolvem casos diferentes; o código de convite **não** foi substituído,
porque continua sendo o único caminho para quem já tem conta em outra casa.

**A senha é o ponto sensível do segundo caminho.** Quem cadastra escolhe a senha e precisa
entregá-la — e, enquanto a pessoa não trocar, quem cadastrou continua sabendo. Num app em que
um membro avalia o trabalho do outro, isso esvazia a avaliação: por isso `PATCH /auth/password`
(troca de senha) existe junto, e a tela de Casa diz isso em texto.

> **A troca de senha vem do browser, não de Server Action** — como o login. Quem grava o
> cookie novo é a própria API, na resposta; numa Server Action o `Set-Cookie` não chegaria ao
> navegador e a sessão antiga (já inválida) ficaria no lugar.

### Tarefas — "o que precisa ser feito na casa"

| Ação | Chamada |
|---|---|
| Listar | `GET /households/{householdId}/tasks` |
| Filtrar | `?status=active&assignedTo=<id|unassigned>&frequency=diaria&difficulty=dificil&q=banheiro&sort=-createdAt&page=1&pageSize=20` |
| Detalhe | `GET /tasks/{taskId}` |
| Criar | `POST /households/{householdId}/tasks` — exige `canManageTasks` |
| Editar | `PATCH /tasks/{taskId}` — exige `canManageTasks` |
| Arquivar | `DELETE /tasks/{taskId}` |
| Excluir de vez | `DELETE /tasks/{taskId}?hard=true` — exige papel `owner` |

Criar uma tarefa exige `recurrence` (ver [DOMAIN.md § 3](./DOMAIN.md)). **Arquivar é o padrão** de
`DELETE`: o histórico e o placar sobrevivem.

### Cronograma — a agenda

| Ação | Chamada |
|---|---|
| Agenda da casa | `GET /households/{householdId}/occurrences?from&to&status&assignedTo` |
| Minha agenda | `GET /me/occurrences?from&to&status` |
| Ocorrências de uma tarefa | `GET /tasks/{taskId}/occurrences` |
| Detalhe | `GET /occurrences/{occurrenceId}` |
| Concluir | `POST /occurrences/{occurrenceId}/complete` `{ note?, completionDate? }` |
| Pular | `POST /occurrences/{occurrenceId}/skip` `{ reason? }` — exige `canManageTasks` |
| Desfazer | `POST /occurrences/{occurrenceId}/undo` |
| Histórico | `GET /occurrences/{occurrenceId}/executions` |

**Sem `from`/`to`, a janela é de hoje até o horizonte da casa** (30 dias por padrão). Para uma
visão semanal, mande os dois.

Cada ocorrência traz `isLate` já calculado e o resumo da tarefa (`task.name`, `task.difficulty`),
para não ser preciso buscar a tarefa à parte.

### Conferir — a fila de avaliação

| Ação | Chamada |
|---|---|
| O que falta avaliar | `GET /households/{householdId}/executions?pendingReviewForMe=true` |
| Avaliar | `PATCH /executions/{executionId}/rating` `{ rating: 1..5, note? }` |
| Listar tudo | `GET /households/{householdId}/executions?from&to&status&executedBy` |

O executor **nunca** aparece na própria fila, e `rating` é obrigatório. A lista já vem com
`executedBy` e `ratedBy` populados.

### Desempenho

| Ação | Chamada |
|---|---|
| Relatório da casa | `GET /households/{householdId}/stats?from&to` |
| Ranking | `GET /households/{householdId}/leaderboard?period=week|month|all` |
| Minha pontuação | `GET /me/score?householdId&period` |

`/stats` devolve `totals`, `byMember` (todos os membros, inclusive zerados) e `byTask`.
`/leaderboard` já vem ordenado e com `position`. Leia as definições das métricas em
[DOMAIN.md § 8](./DOMAIN.md) antes de rotular qualquer número na tela — em especial: **o eixo é a
data de vencimento**, e a semana começa no **domingo**.


### Lembretes — avisos da casa

| Ação | Chamada |
|---|---|
| Lembretes da casa | `GET /households/{householdId}/reminders?status&recipient&task&q` |
| Detalhe (com próximo disparo e minha última notificação) | `GET /reminders/{reminderId}` |
| Criar | `POST /households/{householdId}/reminders` |
| Editar | `PATCH /reminders/{reminderId}` |
| Arquivar / excluir | `DELETE /reminders/{reminderId}?hard=true` |
| Feito (para mim) | `POST /reminders/{reminderId}/ack` |
| Adiar (para mim) | `POST /reminders/{reminderId}/snooze` `{ minutes }` |
| Minhas notificações | `GET /me/notifications?unread` |
| Marcar como lida | `POST /me/notifications/{deliveryId}/read` |
| Push: configurar/inscrever/remover | `GET /me/push/config`, `POST`/`DELETE /me/push/subscriptions` |

O corpo do lembrete é `{ title, notes?, schedule, recipients?, allMembers?, channels?, task?, skipIfTaskDone? }`.

Seis coisas que a tela precisa saber:

1. `schedule` usa a **mesma recorrência da tarefa** e acrescenta `time` (hora local da
   casa). `ocasional` é o disparo único.
2. `nextFireAt` é instante **UTC**; formate no fuso da casa. O ajudante está em
   `lib/domain/reminders.ts`.
3. **"Feito" e "Adiar" são por pessoa** e não desligam a recorrência. Não desenhe "concluir
   lembrete" — desenhe "feito para mim".
4. **Criança só cria para si**; "todos" exige `canManageReminders`. A criança também só vê
   os lembretes que criou ou recebe.
5. Canal indisponível volta `CHANNEL_NOT_AVAILABLE`. Hoje só `in_app` e `push` existem;
   não ofereça e-mail/SMS.
6. Push: a chave pública vem de `GET /me/push/config`; a inscrição é **por aparelho**, e no
   iOS só funciona com o PWA instalado na Tela de Início (16.4+).

### Casa — membros e convite

| Ação | Chamada | Quem pode |
|---|---|---|
| Listar moradores | `GET /households/{householdId}/members` | qualquer membro |
| Ver o código de convite | `GET /households/{householdId}/invite` | `owner` e `adult` |
| Gerar código novo | `POST /households/{householdId}/invite` | só `owner` |
| Mudar papel e permissões | `PATCH /households/{householdId}/members/{userId}` | só `owner` |
| Remover alguém | `DELETE /households/{householdId}/members/{userId}` | `owner` para qualquer um; **qualquer um remove a si mesmo** (sair da casa) |

Três coisas que a tela precisa saber antes de desenhar isso:

1. **`capabilities` vem resolvido; `overrides` não vem.** A API devolve o resultado (papel +
   exceções), nunca as exceções em si. A tela não tem como saber *o que* foi ajustado à mão —
   ela só pode comparar o resultado com o padrão do papel e marcar a diferença.
2. **O `PATCH` de membro apenas MESCLA as capacidades.** Não existe operação para limpar uma
   exceção. Por isso vale mandar sempre as quatro capacidades junto com o papel: enviar só o
   papel deixaria uma exceção antiga vencer o papel novo, em silêncio.
3. **A casa não pode ficar sem `owner`.** Rebaixar ou remover o último responde
   `LAST_OWNER_CANNOT_LEAVE` — melhor esconder a ação do que oferecer um botão que só pode falhar.

---

## 6. Listagens: paginação, filtros e ordenação

- `page` (padrão 1) e `pageSize` (padrão 20, **máximo 100**) — venha sempre com `meta`.
- `sort` aceita `campo` ou `-campo`. **Há allow-list por rota**; campo não permitido cai no padrão
  silenciosamente em vez de dar erro.
- Filtro com valor inválido devolve `400 VALIDATION_ERROR` com `details`.
- `assignedTo=unassigned` é o filtro de "sem responsável".
- `status` filtra pelo estado, e os valores diferem por recurso:
  tarefa `active|archived` · ocorrência `pending|done|overdue|skipped` ·
  execução `pending_review|approved|auto_approved`.

---

## 7. Datas e fuso

**A API trabalha com dias do calendário da casa**, e o front deve fazer o mesmo.

| Tipo | Formato | Exemplo |
|---|---|---|
| Dia (`dueDate`, `startDate`) | `YYYY-MM-DD` | `2025-07-10` |
| Instante (`completionDate`, `createdAt`) | ISO 8601 UTC | `2025-07-10T18:30:00.000Z` |

**Não converta `dueDate` para `Date` e depois formate com o fuso do browser.** Isso desloca o dia
para quem estiver em outro fuso. Trate `dueDate` como texto e formate a partir dos componentes:

```ts
const [ano, mes, dia] = dueDate.split('-');
formatar(new Date(Number(ano), Number(mes) - 1, Number(dia)));  // meia-noite LOCAL
```

O fuso da casa vem em `household.timezone` quando você precisar exibir um **instante** (por
exemplo, "concluída às 15h").

---

## 8. Armadilhas

1. **Não decodifique o JWT.** Use `GET /auth/me`. O token não carrega papel nem casa.
2. **Serializar o refresh.** Ele rotaciona; duas chamadas simultâneas derrubam a segunda.
3. **Sempre `credentials: 'include'`** nas chamadas, senão o cookie não vai junto.
4. **Casa atual é estado do front.** O token não a carrega; guarde o `householdId` e use em todas
   as rotas de dados.
5. **`dueDate` é texto.** Ver §7.
6. **Erro sempre tem `code`.** Um `if (res.status === 400)` genérico perde informação — use o código.
7. **Otimista com cuidado.** Concluir e avaliar mudam estado de terceiros: recarregue a lista em vez
   de confiar no que estava na tela.
8. **`pendingReviewForMe` vem vazio para quem não avalia** — `child` não tem `canRate`.
9. **Esconda pelo `capabilities`**, sem confiar que a API vai recusar (ela vai, mas o usuário não
   deveria nem ver o botão).
10. **Server Action que dá certo também precisa dizer que deu certo.** Uma action que devolve o
    mesmo estado no sucesso e no repouso é indistinguível do "nada aconteceu ainda" — foi assim
    que o diálogo de concluir ficou aberto sobre a lista já revalidada. Use três estados
    (`'idle' | 'ok' | 'error'`, ver `components/schedule/actionState.ts`) e observe o `'ok'` num
    efeito para fechar o que abriu. Vale para todo diálogo que se fecha sozinho.

---

## 9. Exemplo completo

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

async function api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${BASE}/api/v1${caminho}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const corpo = resposta.status === 204 ? null : await resposta.json();

  if (!resposta.ok) {
    const { code, message, details, requestId } = corpo.error;
    throw new ApiError(resposta.status, code, message, details, requestId);
  }

  return corpo as T;
}

// Uso
const { data } = await api<{ data: Task[] }>(`/households/${householdId}/tasks?status=active`);
const concluida = await api(`/occurrences/${id}/complete`, { method: 'POST', body: { note: 'Feito!' } });
```

---

## 10. Estado atual do front

O app vive em `frontend/` — Next.js 15 (App Router), React 19, MUI 7, TypeScript. **Ele está
construído.** O que segue é o inventário real; planos antigos descrevendo telas "a fazer" não valem
mais.

### Rotas

| Rota | O que é |
|---|---|
| `/login`, `/register` | Entrada. O formulário roda no browser; quem grava o cookie é a API |
| `/onboarding` | Cria a casa, ou entra numa por convite — para quem está logado sem casa |
| `/tasks` | Lista das tarefas ativas |
| `/tasks/new`, `/tasks/[taskId]/edit` | Formulário de tarefa |
| `/tasks/[taskId]` | Detalhe da tarefa |
| `/schedule` | A agenda do horizonte, com concluir e pular ocorrência |
| `/reminders` | Lembretes da casa, notificações pendentes e push do aparelho |
| `/reminders/new`, `/reminders/[reminderId]/edit` | Formulário de lembrete |
| `/reminders/[reminderId]` | Detalhe do lembrete |
| `/performance` | Os números do período |
| `/household` | Membros, convite e criação de membro |
| `/panel` | **Painel da TV** — só leitura, navegação por controle remoto |
| `/offline` | Fallback do service worker |

### Como o front fala com a API

- **Leitura**: Server Components, pelo client de `lib/domain/api/`.
- **Escrita**: Server Actions (`app/(app)/{tasks,schedule,household}/actions.ts`).
- **Só quatro coisas saem do browser**: login, cadastro, troca de senha e logout. Motivo: é a
  própria API que grava o cookie, e numa Server Action o `Set-Cookie` não chegaria ao browser.
  A exceção é o **push**: inscrição e remoção do aparelho precisam do `PushManager` e da
  permissão do navegador, então rodam no cliente (`lib/device/push.ts`).
- Os tipos saem do contrato: `npm run gen:api` lê `docs/openapi.yaml` e regenera
  `lib/domain/api/schema.d.ts`. Não edite esse arquivo à mão.

### Os cascos

O mesmo app serve quatro dispositivos, decididos **no servidor** pelo `User-Agent`
(`lib/device/profile.ts`, aplicado em `app/layout.tsx` e `app/(app)/layout.tsx`; o `middleware.ts`
cuida só da sessão):

| `DeviceKind` | Dispositivo | O que muda |
|---|---|---|
| `mobile` | celular | PWA instalável — é o app completo |
| `tablet` | tablet | o app completo |
| `desktop` | navegador | o app completo |
| `tv` | TV / Android TV | tela cheia, **só leitura**, sem barra de navegação; D-pad substitui o toque |

Na TV a navegação espacial é `lib/device/spatial.ts` (geometria pura, testada com
`npm run test:spatial`), ligada pelo hook `useSpatialNavigation`. O anel de foco mora em
`globals.css`, sob `html[data-tv]`.

### Shell e estado

- `components/shells/AppShell.tsx` monta a moldura; `components/shells/nav.ts` diz o que aparece
  em cada casco. `components/ui/theme.ts` é o tema MUI.
- Sessão e casa atual: `lib/session/*`. O `middleware.ts` renova o token antes de renderizar,
  para o usuário não cair no meio do uso.
- **Sem store global.** O que é do servidor chega por Server Component; o que é local é `useState`.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Next em modo desenvolvimento (turbopack) |
| `npm run gen:api` | Regenera os tipos a partir do `openapi.yaml` |
| `npm run gen:icons` | Gera os ícones do PWA **e** os da TV (`../tv/.../res/`) |
| `npm run test:spatial` | Testa a geometria da navegação por D-pad |
| `npm run lint` | ESLint |
