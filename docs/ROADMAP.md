# HouseWorks — Roadmap da API

> **Estratégia: API First.** O contrato em [`docs/openapi.yaml`](./openapi.yaml) é a fonte de verdade.
> Nenhuma regra de negócio nasce no frontend: o front apenas consome o que está especificado aqui.
> Ordem de execução: **API 100% pronta → depois o frontend.**

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

**Resolvidos até aqui (Fases 0 e 1):** P1, P2, P3, P4, P6, P7 e P10.
**Pendentes:** P5 e P8 (Fase 2), P9 e P12 (Fase 5), P11 (parcial — o backend já expõe `/auth/me`; falta o
front parar de decodificar o JWT por conta própria).

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
- **Implementação:** RRULE (padrão iCalendar, via lib `rrule`) é a representação **interna**;
  a API expõe o objeto `Recurrence` ergonômico (`frequency`, `interval`, `weekdays`, `dayOfMonth`, `startDate`, `endDate`).
- **Geração:** job diário materializa `horizonDays` (default 30) à frente; leituras de agenda fazem backfill idempotente.

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

- [ ] Modelo `TaskOccurrence` + gerador idempotente (job diário + backfill on-read)
- [ ] Conversão `Recurrence` → RRULE; `household.timezone` (default `America/Sao_Paulo`) em todo cálculo de dia
- [ ] `GET /households/{id}/occurrences?from&to&status&assignedTo` (a tela "Cronograma")
- [ ] Transição para `overdue` (grace period configurável) e `skipped`
- [ ] Rotação/distribuição de responsável entre membros (opcional por tarefa)
- [ ] Índice `TaskOccurrence{household,dueDate,status}`

**Aceite:** com *fake timers*, geração correta para `diaria`, `semanal` (multi-`weekdays`), `mensal`,
`anual` e `ocasional`, cobrindo virada de mês, dia 31 em mês de 30, fevereiro e ano bissexto;
reprocessar o job não duplica ocorrências (idempotência provada por teste).

### Fase 3 — Execução e avaliação (as regras do produto)

- [ ] `POST /occurrences/{id}/complete` → cria `TaskExecution` em `pending_review` e fecha a ocorrência
- [ ] `POST /occurrences/{id}/skip` e `POST /occurrences/{id}/undo` (desfazer é obrigatório — hoje não existe)
- [ ] `PATCH /executions/{id}/rating`: **quem executou não avalia** (regra preservada), exige `canRate`
- [ ] Janela de avaliação (`ratingWindowHours`, default 72h) → `409 RATING_WINDOW_CLOSED`
- [ ] Auto-aprovação após a janela, com `rating: null` e `status: auto_approved`
- [ ] Pontos só entram no score quando a execução é aprovada

**Aceite:** auto-avaliação → `403 CANNOT_RATE_OWN_EXECUTION`; avaliar duas vezes → `409 EXECUTION_ALREADY_RATED`;
`undo` reverte ocorrência **e** subtrai os pontos do score; concluir ocorrência já concluída → `409`;
`child` concluindo ocorrência de outro membro → `403 OCCURRENCE_NOT_ASSIGNED_TO_YOU`.

### Fase 4 — Desempenho e agregações

- [ ] `GET /households/{id}/stats?from&to` (taxa de conclusão, pontualidade, atraso médio, notas)
- [ ] `GET /households/{id}/leaderboard?period=week|month|all`
- [ ] `GET /me/score?householdId&period`
- [ ] Aggregation pipelines no Mongo (nada de agregar no Node nem no front)

**Aceite:** números conferem com fixture de seed conhecida (asserção exata, não aproximada);
`p95 < 300ms` com 50k ocorrências geradas por script de volume.

### Fase 5 — Endurecimento

- [x] ~~Validação de entrada com schema (zod), eliminando mass-assignment~~ — **antecipado para a Fase 0**
- [ ] `helmet`, `express-rate-limit` no login, CORS por ambiente (`allowedOrigins` deixa de ser hardcoded)
- [ ] Paginação/filtros/ordenação em todas as listagens (hoje `getAllTasks` devolve tudo)
- [ ] **Rotacionar `JWT_SECRET`** e remover segredos do Git (`.env` → `.env.example` + secret no deploy)
- [ ] Refresh de token / expiração consistente (backend `1h` vs front `JWT_EXPIRES_IN=3h`)
- [ ] Remover código morto: `config/` na raiz, `routes/other.js`, `app/api/test-env.ts`
- [ ] CI (lint + test + lint do spec) — a suíte de testes já existe desde a Fase 0
- [ ] Dockerfile em multi-stage com `npm ci --omit=dev` na imagem final: hoje o `npm install` do
  container instala também jest/supertest/mongodb-memory-server, que só servem ao desenvolvimento
- [ ] Seed reescrito para o modelo novo e reutilizado como fixture de teste

**Aceite:** CI verde; nenhum segredo no histórico novo; `npm test` cobre autorização, recorrência e pontuação.

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
| C3 | Ambiguidade submódulo vs clone solto (P12) | Decidir: repos irmãos (recomendado) ou submódulo inicializado. Uma única fonte de verdade. |
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
