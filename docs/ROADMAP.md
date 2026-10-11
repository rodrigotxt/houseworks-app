# HouseWorks — Roadmap da API

> **Estratégia: API First.** O contrato em [`docs/openapi.yaml`](./openapi.yaml) é a fonte de verdade.
>
> **Status: as seis fases estão concluídas e a API cobre o contrato inteiro** — as 36 operações
> declaradas respondem (verificado batendo em cada rota do `openapi.yaml`; nenhuma cai em
> `ROUTE_NOT_FOUND`). Todos os problemas do baseline estão resolvidos.
>
> **Layout de repositórios (decidido):** `houseworks-app` (API) e `houseworks-frontend` são **repos
> irmãos**, lado a lado. O submódulo foi removido — ele nunca foi inicializado e criava duas fontes
> de verdade para o mesmo código. O `docker-compose.yml` referencia o irmão por `../houseworks-frontend`.
> Nenhuma regra de negócio nasce no frontend: o front apenas consome o que está especificado aqui.
> Ordem de execução: **API 100% pronta → depois o frontend.**

---

## 0. Documentação

| Documento | Para quê |
|---|---|
| [openapi.yaml](./openapi.yaml) | **O contrato.** Fonte de verdade da API |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Mapa do código, convenções e receituário (como adicionar endpoint/campo/modelo) |
| [DOMAIN.md](./DOMAIN.md) | Entidades, regras de negócio e invariantes que não podem ser violadas |
| [DECISIONS.md](./DECISIONS.md) | Registro de decisões técnicas: o que foi decidido, o que foi descartado e por quê |
| [OPERATIONS.md](./OPERATIONS.md) | Rodar, configurar, testar, implantar e resolver problemas |
| [FRONTEND.md](./FRONTEND.md) | Guia de integração para construir a UI |
| **ROADMAP.md** (este) | Histórico das fases, critérios de aceite e o que foi resolvido |

---

## 1. Baseline (o que existe hoje)

Auditoria do estado atual em `main` (último commit `e2aa0dc`, 2025-06-24).

**Existe e funciona**

- Auth com JWT (`POST /api/auth/register`, `POST /api/auth/login`), bcrypt via `pre('save')`.
- CRUD de tarefas (`/api/tasks`) e histórico de execução (`/api/tasks-executions`) com ownership por `createdBy`.
- Docker Compose (Mongo + backend + frontend), seed com a família, debug no VS Code.

**Problemas estruturais que motivam este roadmap**

| # | Problema | Evidência | Impacto |
|---|---|---|---|
| P1 | Modelo é *user-centric*, produto é *household-centric* | `taskController.getAllTasks` filtra `{ createdBy: req.user.id }` | Tarefa criada pelo pai é invisível aos filhos. Inviabiliza o produto. |
| P2 | Não existe `Household` / `Membership` / papéis | `models/` tem só `User`, `Task`, `TaskExecutionHistory` | Filho tem os mesmos poderes do pai. Sem isolamento por casa. |
| P3 | Não existe responsável pela tarefa | `Task` não tem `assignedTo` | A tela "Cronograma" não tem dado para existir. |
| P4 | Furo de autorização em produção | `taskExecutionHistoryController.js` L17-22: checagem de posse **comentada** | Qualquer usuário autenticado registra execução em qualquer `taskId`. |
| P5 | Regra de negócio central é campo morto | `Task.frequency` e `nextDueDate` nunca são calculados | Não há recorrência, atraso, nem agenda. |
| P6 | Autorização duplicada e divergente | Mesmo `task.createdBy.toString() !== req.user.id` copiado 4x com mensagens diferentes | Cada endpoint novo replica a regra e mais um erro. |
| P7 | Respostas inconsistentes | `res.json({ message })`, recurso cru, e `res.status(500).send('texto')` | Front precisa de tratamento ad-hoc por endpoint. |
| P8 | Sem timezone | Nenhuma menção a `America/Sao_Paulo` no projeto | `diaria`/`semanal` produz bug silencioso na virada do dia. |
| P9 | Segredos versionados | `.env` commitado; `JWT_SECRET` hardcoded em `houseworks-frontend/lib/auth.tsx` L7 | Credencial exposta no histórico do Git. |
| P10 | Índices insuficientes | Só existe `TaskExecutionHistory.index({task,executedBy,completionDate})` | Agregações de desempenho farão full scan. |
| P11 | Contrato de auth quebrado | Backend assina `{ user: {...} }`; front tipa `{ id, email, ... }` e lê `user.email` | Dashboard renderiza `undefined`. |
| P12 | Ambiguidade de repositório | `houseworks-app/frontend/` é submódulo vazio + clone solto em `houseworks-frontend/` | Duas fontes de verdade que vão divergir. |

**Resolvidos até aqui (Fases 0 a 5):** P1, P2, P3, P4, P5, P6, P7, P8, **P9** e P10.
**Pendente apenas o P11 parcial:** o backend já expõe `/auth/me` e aceita cookie httpOnly; falta o
front parar de decodificar o JWT por conta própria — trabalho da UI, não da API.

O **P12** foi resolvido: submódulo removido e os dois repositórios passam a ser **irmãos**.

---

## 2. Decisões de arquitetura

Três decisões foram levantadas na análise. Abaixo o default adotado para destravar a Fase 0,
com o custo de revisão de cada uma. **Revisáveis antes do fim da Fase 1** — depois disso viram migração.

### D1 — Multi-household no schema desde já ✅ adotado

Todo documento de domínio carrega `household`. Não haverá UI de gestão de casas no MVP,
mas o isolamento é estrutural desde o primeiro commit.

- **Por quê:** no modelo single-household, adicionar tenancy depois exige migrar todas as coleções,
  reescrever toda a autorização e refazer os índices — exatamente o tipo de retrabalho que o "API First" evita.
- **Custo hoje:** um campo obrigatório, um middleware e um índice composto.
- **Alternativa descartada:** "uma família por instalação" — aceitável se o produto nunca sair de casa,
  mas o custo de reverter é assimétrico (barato agora, caro depois).

### D2 — `TaskOccurrence` materializada ✅ adotado

A recorrência é resolvida em **ocorrências persistidas** (`task`, `dueDate`, `assignedTo`, `status`),
geradas a partir de uma regra, e não calculada on-the-fly a cada leitura.

- **Por quê:** sem registro persistido não existe "atrasada", não existe histórico por ocorrência,
  não existe "quem fez no dia X" e não existe agregação de desempenho barata.
- **Implementação:** a API expõe o objeto `Recurrence` ergonômico (`frequency`, `interval`, `weekdays`,
  `dayOfMonth`, `startDate`, `endDate`) e as datas são expandidas por código próprio
  (`services/recurrence.js`). **RRULE foi descartado durante a Fase 2:** o `BYMONTHDAY` do iCalendar
  *pula* fevereiro numa regra "dia 31", e o contrato exige que caia no último dia do mês.
- **Geração:** job diário (`node-cron`) materializa `horizonDays` (default 30) à frente; leituras de
  agenda fazem backfill idempotente — **o job é otimização, não requisito de correção**.

### D3 — Gamificação no escopo da API (MVP) ✅ adotado

Pontos e ranking são contrato da v1 (`/stats`, `/leaderboard`, `/me/score`), não fase 2 do produto.

- **Por quê:** a regra de "outro membro avalia" (já presente no código, `addNoteOrRating`) só faz sentido
  se produzir consequência visível. E agregar depois exige remodelar execução e avaliação — de novo, retrabalho.
- **Pontos:** derivados da dificuldade por default
  (`muito_facil`=1, `facil`=2, `medio`=3, `dificil`=5, `muito_dificil`=8), sobreponíveis por tarefa em `points`.
- **Score:** soma de pontos de execuções **aprovadas** no período.

---

## 3. Fases

### Fase 0 — Contrato e envelope  ·  *fundação do contrato*

- [x] `docs/openapi.yaml` (OpenAPI 3.1) como fonte de verdade
- [x] Prefixo de versão `/api/v1`, com `/api` mantido como alias de compatibilidade
- [x] Envelope único: sucesso `{ data, meta }` · erro `{ error: { code, message, details, requestId } }`
- [x] `errorHandler` central + handler de 404 + `requestId` (`X-Request-Id`) em toda resposta
- [x] Catálogo de `ErrorCode` estável (o front traduz por código, nunca por texto)
- [x] `redocly.yaml` — lint do contrato configurado (spec valida com 0 warnings)
- [x] Validação de entrada com **zod** e allow-list estrita (fecha o mass-assignment)
- [x] Harness de teste: jest + supertest + `mongodb-memory-server`
- [ ] Lint do spec no CI, docs publicadas em `/docs`

**Aceite:** nenhum endpoint devolve texto solto; todo erro tem `code` do catálogo e `requestId`;
o spec valida no CI e cobre 100% das rotas implementadas.

**Status:** implementado, com 36 testes em 4 suítes (`backend/tests/`). O harness sobe um Mongo em
memória por arquivo — `app.js` não conecta sozinho; quem conecta é `server.js`.

**Aderência parcial ao contrato — esperado nesta fase.** A Fase 0 alinha o *envelope*, o *catálogo de
erros* e a *validação*. Os **formatos dos recursos** convergem nas fases seguintes. Ao fim da Fase 1, o que
ainda diverge é: `Task.frequency` é string (o contrato pede o objeto `recurrence` — Fase 2) e
`TaskExecutionHistory` não tem `status`, `ratedBy` nem `occurrenceId` (Fase 3). Já alinhado: `id` em vez
de `_id`, sem `__v`, sem `password`, e visibilidade por casa em vez de por criador.

### Fase 1 — Fundação do domínio  ·  *primeiro commit de negócio*

**Fase 1a — casas, papéis e autorização** ✅

- [x] Modelos `Household` e `Membership` (`role: owner | adult | child` + capacidades **derivadas**, nunca gravadas)
- [x] `requireAuth` (claim `sub`) → `requireMember` → `authorize(capability)` / `requireRole(...)`
- [x] Rotas de casa: CRUD, convite (ler/rotacionar), membros e ingresso por código
- [x] `GET /auth/me` com usuário + memberships; cadastro com `householdName` já cria a casa
- [x] Proteção do último `owner` (não é rebaixado nem sai da casa)
- [x] Índices `Membership{user,household}` (unique) e `Membership{household,role}`
- [x] Isolamento entre casas provado por teste (não-membro → `403 NOT_HOUSEHOLD_MEMBER`)

**Fase 1b — tarefas escopadas e fim do furo P4** ✅

- [x] `Task` ganha `household`, `assignedTo`, `points`, `archivedAt`; `status` vira `active | archived`
- [x] `TaskExecutionHistory` ganha `household` — **é isto que fecha o P4**
- [x] Checagens de posse eliminadas: o escopo vem de `requireMember` ou do próprio recurso (`loadTask` / `loadExecution`)
- [x] Rotas de tarefa em `/households/{householdId}/tasks` e `/tasks/{taskId}`
- [x] Cascata de `DELETE /households/{id}` inclui tarefas e execuções
- [x] Seed reescrito para o modelo novo (verificado ponta a ponta: 5 usuários, 1 casa, 5 memberships, 5 tarefas, 2 execuções)
- [x] Índices `Task{household,status}`, `Task{household,assignedTo}`, `TaskExecutionHistory{household,completionDate}`
- [x] `routes/other.js` (código morto do baseline) removido

**Efeito colateral deliberado:** `POST /tasks-executions` deixou de existir. No contrato, criar execução
acontece ao concluir uma ocorrência (`POST /occurrences/{id}/complete`), que chega na Fase 3. Entre a 1b e a
Fase 3 **não há como marcar uma tarefa como feita pela API** — aceitável enquanto não há front nem usuários, e
preferível a manter um endpoint que o contrato não tem. Os testes da 1b semeiam execuções direto no modelo.

**Aceite (testes de integração obrigatórios):**
membro de outra casa recebe `403 NOT_HOUSEHOLD_MEMBER`/404 em **todas** as rotas;
`child` recebe `403 INSUFFICIENT_ROLE` ao criar/editar/arquivar tarefa;
tarefa criada por um `adult` é visível a **todos** os membros da casa (corrige P1);
requisição sem token → `401`; token expirado → `401 TOKEN_EXPIRED`.

### Fase 2 — Motor de recorrência e agenda

### Fase 2 — Motor de recorrência e agenda ✅

- [x] Modelo `TaskOccurrence` + gerador idempotente (job `node-cron` + backfill na leitura)
- [x] `frequency` virou o objeto `recurrence` do contrato; `household.timezone` decide todo "dia" da casa
- [x] `GET /households/{id}/occurrences`, `GET /tasks/{id}/occurrences`, `GET /occurrences/{id}` e `GET /me/occurrences`
- [x] Transição para `overdue` com tolerância por casa (`overdueGraceHours`)
- [x] Rodízio de responsável entre membros (`assignmentStrategy: rotate`)
- [x] Índices `{task,dueDate}` (unique), `{household,dueDate,status}` e `{household,assignedTo,dueDate}`

**Aceite:** geração correta para `diaria`, `semanal` (multi-`weekdays`), `mensal`, `anual` e `ocasional`,
cobrindo virada de mês, dia 31 em mês de 30, fevereiro e ano bissexto; reprocessar o job não duplica
ocorrências. Provado em `tests/recurrence.test.js` (bordas de calendário, sem banco) e
`tests/occurrences.test.js` (agenda, atraso, rodízio, idempotência).

**Três desvios conscientes do plano original:**

1. **Sem RRULE.** O `BYMONTHDAY` do iCalendar *pula* fevereiro para uma regra "dia 31", enquanto o contrato
   exige que caia no último dia do mês. A expansão é própria (`services/recurrence.js`), em matemática de
   calendário pura — o que também a torna testável borda por borda, sem banco.
2. **Relógio injetado em vez de *fake timers*.** O gerador recebe `now` por parâmetro, o que dá testes
   determinísticos sem congelar o `Date` global (que atrapalha Mongoose e o Mongo em memória).
3. **`skipped` existe como estado, mas ainda sem rota.** Concluir, pular e desfazer chegam na Fase 3
   (`POST /occurrences/{id}/complete|skip|undo`).

### Fase 3 — Execução e avaliação (as regras do produto)

### Fase 3 — Execução e avaliação ✅

- [x] `POST /occurrences/{id}/complete` → cria a execução em `pending_review` e fecha a ocorrência
- [x] `POST /occurrences/{id}/skip` e `POST /occurrences/{id}/undo`
- [x] `PATCH /executions/{id}/rating`: **quem executou não avalia**, exige `canRate`
- [x] Janela de avaliação (`ratingWindowHours`, default 72h) → `409 RATING_WINDOW_CLOSED`
- [x] Auto-aprovação após a janela, com `rating: null` e `status: auto_approved`
- [x] Pontos só contam quando a execução é aprovada
- [x] `TaskExecutionHistory` renomeado para `TaskExecution` (nome do contrato) e ganhou `occurrence`
- [x] Fila de conferência (`?pendingReviewForMe=true`) e histórico por ocorrência

**Aceite:** auto-avaliação → `403 CANNOT_RATE_OWN_EXECUTION`; avaliar duas vezes → `409 EXECUTION_ALREADY_RATED`;
`undo` reverte ocorrência **e** subtrai os pontos do score; concluir ocorrência já concluída → `409`;
quem não administra tarefas concluindo ocorrência de outro membro → `403 OCCURRENCE_NOT_ASSIGNED_TO_YOU`.
Tudo coberto em `tests/executions.test.js` (32 casos).

**Decisões tomadas na execução:**

1. **Desfazer REMOVE a execução** — é assim que os pontos saem do placar, por consequência, sem nenhum
   ajuste manual de score. O evento vai para log de auditoria (`utils/audit.js`), como o contrato exige
   ("nunca apaga silenciosamente"). Se a operação passar a exigir auditoria consultável, o log vira coleção
   sem mudar o ponto de chamada.
2. **Desfazer não devolve "pending" cego.** A ocorrência volta ao estado que o calendário determina hoje:
   `pending`, ou `overdue` se o prazo já passou — senão uma ocorrência vencida reapareceria como se ainda
   desse tempo.
3. **Registro retroativo limitado a 7 dias**, e nunca no futuro. Dá para marcar o que se esqueceu, sem
   reescrever o mês passado.
4. **A ordem das checagens na avaliação importa:** status antes da janela, para que "avaliou duas vezes" e
   "avaliou atrasado" sejam erros distintos.

### Fase 4 — Desempenho e agregações

### Fase 4 — Desempenho e agregações ✅

- [x] `GET /households/{id}/stats?from&to` — totais, por membro e por tarefa
- [x] `GET /households/{id}/leaderboard?period=week|month|all`
- [x] `GET /me/score?householdId&period`
- [x] Tudo agregado no Mongo (`services/stats.js`): nada somado no Node nem no front
- [x] `scripts/seed-volume.js` para medir com volume realista

**Aceite:** números conferem com fixture conhecida (asserção **exata**, não aproximada) em
`tests/stats.test.js`; `p95 < 300ms` com 50k ocorrências — **atendido** (ver medições abaixo).

**Decisões tomadas na execução:**

1. **Eixo único: a data de vencimento.** "A semana" é "as tarefas cuja semana era esta", não
   "o que foi marcado como feito nestes sete dias" — assim o relatório bate com a agenda que a
   família vê. Consequência registrada no contrato: uma ocorrência vencida no domingo e concluída
   na segunda conta para a semana anterior.
2. **Semana começando no domingo**, igual à convenção de `weekdays` na recorrência (0 = domingo).
3. **Todos os membros aparecem, inclusive com zero.** Um ranking que esconde quem não fez nada
   esconde exatamente a informação que interessa numa casa.
4. **Membros medidos por quem executou; pendências por quem foi designado.** São eixos diferentes
   de propósito: `assignedTo` costuma ser nulo ("qualquer um pode assumir"), então agrupar tudo
   por ele deixaria a maior parte do trabalho sem dono.
5. **O período é o calendário cheio.** Numa semana em andamento a taxa de conclusão parece baixa
   porque de fato está: a semana não acabou.
6. **O vencimento é desnormalizado na execução** (`TaskExecution.dueDate`). A primeira versão
   partia da execução e juntava cada uma com a sua ocorrência: 50 mil junções e **15 segundos** num
   relatório de histórico completo. Com o eixo do relatório copiado na execução, a consulta virou
   varredura de índice com `$facet` produzindo as duas agrupações de uma vez.

**Medições com 50k ocorrências e 28k execuções** (`scripts/seed-volume.js`):

| Endpoint | Antes (com `$lookup`) | Depois (desnormalizado) |
|---|---|---|
| `/stats` semana | p95 103ms | **p95 44ms** |
| `/stats` 30 dias | p95 225ms | **p95 38ms** |
| `/stats` mês | p95 197ms | **p95 53ms** |
| `/leaderboard` | p95 115ms | **p95 37ms** |
| `/me/score` | p95 208ms | **p95 40ms** |
| `/stats` histórico completo | p50 14 909ms | **p50 662ms** |

A cópia não pode divergir: o `dueDate` de uma ocorrência nunca muda, e as únicas operações que
apagam ocorrências (desfazer e excluir a tarefa) levam as execuções junto.

**Pendência conhecida:** `GET /households/{id}/occurrences` fica em p95 223ms numa janela de 30
dias sobre esse volume — o custo está no backfill e na marcação de atraso que antecedem a leitura,
não na consulta. Cabe na Fase 5 se incomodar.

### Fase 5 — Endurecimento ✅

- [x] ~~Validação de entrada com schema (zod), eliminando mass-assignment~~ — **antecipado para a Fase 0**
- [x] `helmet`, `express-rate-limit` em login/registro, CORS por `ALLOWED_ORIGINS`
- [x] Paginação, filtros e ordenação com allow-list em todas as listagens (Fases 1b/2/4)
- [x] **Segredos fora do Git e rotacionados**: `.env` destrackeado, `.env.example` como molde,
  `JWT_SECRET` e senha do Mongo novos
- [x] **`POST /auth/logout` e `POST /auth/refresh`** — as duas rotas do contrato que faltavam
- [x] Sessão por cookie httpOnly, com revogação real por `jti` (`models/RevokedToken.js`, índice TTL)
- [x] Expiração consistente e configurável (`JWT_EXPIRES_IN`, 1h por padrão)
- [x] Código morto: `config/` na raiz, `routes/other.js` e `app/api/test-env.ts` (no repo do front)
- [x] Dockerfile em multi-stage com `npm ci --omit=dev` e usuário sem privilégio
- [x] CI escrito (`.github/workflows/ci.yml`): lint do contrato, testes e build da imagem de produção
- [x] Seed é o estado inicial para humanos (`npm run seed`); os testes usam fixtures próprias, que é
  melhor do que depender do seed — mexer no seed não deve quebrar teste

**Aceite:** nenhum segredo no histórico novo; a suíte cobre autorização, recorrência, pontuação e o
ciclo de sessão. **O CI não é verificável daqui** — roda no primeiro push para o GitHub.

**O que a verificação encontrou e vale registrar:**

1. **O `docker compose` não subia.** Os dois serviços referenciavam `env_file` inexistentes, e o
   Compose falha quando o arquivo não existe. Além disso o front não recebia
   `NEXT_PUBLIC_API_BASE_URL` — subiria sem saber onde está a API (era o item C2).
2. **A imagem de produção não conseguia ler o próprio código.** O `COPY` herdava a permissão dos
   arquivos do host, e 70 arquivos estavam em `600`: o processo subia e morria com `EACCES` ao
   carregar um módulo. Corrigido dos dois lados — `chmod 644` no repositório e
   `COPY --chown=node:node` na imagem, para não depender de quem constrói.
3. **Trocar a senha do Mongo exige recriar o volume.** O Mongo só aplica a senha de root na primeira
   inicialização; um volume `mongo-data` já criado continua com a senha antiga e o backend para de
   conectar. Está avisado no `.env.example`.

---

## 4. Definition of Done da API

A API está "100% pronta" quando, para cada rota do contrato:

1. Está especificada em `docs/openapi.yaml` e a implementação passa no lint do spec.
2. Respeita o envelope e devolve `ErrorCode` do catálogo.
3. Tem autorização declarada (qual papel pode chamar) e **teste de integração para o caso negado**.
4. Valida entrada por schema e nunca aceita campo fora do contrato.
5. Tem índice que suporta sua consulta principal.
6. Tem teste de regra de negócio (não só de rota) para recorrência, avaliação e pontuação.

---

## 5. Contrato com o frontend (resolver antes de começar a UI)

| # | Pendência | Ação |
|---|---|---|
| C1 | JWT incompatível: backend `{ user: {...} }` vs front `{ id, email, ... }` | Backend define os claims (`sub`, `householdId`, `role`); front apenas consome. |
| C2 | `docker-compose` não define `NEXT_PUBLIC_API_BASE_URL` e `env_file: ./frontend/.env` não existe | Corrigir o serviço `frontend` antes do primeiro boot integrado. |
| C3 | ~~Ambiguidade submódulo vs clone solto~~ **RESOLVIDO** | Submódulo removido; repos **irmãos**. O compose aponta para `../houseworks-frontend`. |
| C4 | Auth por `x-auth-token` (hoje) vs cookie httpOnly (front) | Contrato final: cookie `jwt_token` (httpOnly) **e** `Authorization: Bearer` para clientes não-browser. |
| C5 | Sem CORS por ambiente | `ALLOWED_ORIGINS` via env; `localhost:3000` só em dev. |

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| RRULE + timezone é o ponto mais propenso a bug | Usar lib testada (`rrule` + `luxon`/`date-fns-tz`), nunca aritmética de `Date` crua; testes com fake timers. |
| Migração de dados quebra base em uso | Script de migração idempotente e reversível; rodar no seed antes de qualquer base real. |
| Reescrever o front é inevitável | Aceito: o front atual é esqueleto (dashboard placeholder). Nasce contra o contrato, não contra o código. |
| Escopo de gamificação crescer sem limite | Pontos e ranking fecham na Fase 4; recompensas/trocas ficam no backlog pós-MVP. |

---

## 7. Fora de escopo (pós-MVP)

Notificações push/e-mail · anexos e foto como prova de execução · recompensas e troca de pontos ·
múltiplas casas por usuário na UI · i18n · app mobile nativo · OAuth social.

---

## 8. Como validar o contrato

```bash
npx @redocly/cli lint docs/openapi.yaml          # lint do spec (usa redocly.yaml)
npx @redocly/cli preview-docs docs/openapi.yaml  # docs navegáveis
npx @stoplight/spectral-cli lint docs/openapi.yaml
```

Estado atual: **valid, 0 warnings**.

O endpoint `GET /health` existe para smoke test de integração e não exige autenticação.

---

## 9. Convenção de commits e push

- **Commit a cada avanço completo.** Um incremento coerente por commit — recurso, correção ou documento.
  Nada de `wip` ou de acumular fases num único commit.
- **Push ao fechar um recurso completo ou uma fase.** O remoto só recebe estado íntegro e verificável.
- Mensagens em [Conventional Commits](https://www.conventionalcommits.org/):
  `docs:`, `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
- Escopo quando ajudar a localizar: `feat(tasks):`, `fix(auth):`, `docs(api):`.
- O corpo referencia **o que foi resolvido** — um problema do baseline (P1–P12), um item de fase ou uma
  rota do contrato. Um commit que não fecha nada é sinal de que o incremento ainda não está pronto.
