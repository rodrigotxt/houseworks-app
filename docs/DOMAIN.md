# Modelo de domínio e regras de negócio

O que cada entidade é, quais relações existem e **quais invariantes não podem ser violadas**.
Leia junto com [ARCHITECTURE.md](./ARCHITECTURE.md) (onde o código mora) e
[DECISIONS.md](./DECISIONS.md) (por que cada escolha foi feita).

---

## 1. Visão geral

```
                  ┌──────────────┐
                  │     User     │  identidade (nome, usuário, email, senha)
                  └──────┬───────┘
                         │
                  ┌──────┴───────┐   papel + capacidades
                  │  Membership  │   (owner | adult | child)
                  └──────┬───────┘
                         │
                  ┌──────┴───────┐   a CASA. Raiz do isolamento
                  │  Household   │   (fuso, horizonte, tolerância, janela de avaliação)
                  └──────┬───────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
┌────┴─────┐      ┌──────┴───────┐    ┌──────┴───────┐
│   Task   │─────▶│TaskOccurrence│───▶│ TaskExecution│
│ (regra)  │ gera │ (obrigação   │    │ (o que foi   │
│          │      │  datada)     │    │  feito)      │
└──────────┘      └──────────────┘    └──────────────┘
```

**A regra estrutural mais importante:** todo documento de domínio carrega `household`. Não existe
tarefa, ocorrência ou execução "solta". É isso que impede uma casa de enxergar a outra.

---

## 2. Entidades

### User

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | |
| `username` | string | único, 3–30, `[a-zA-Z0-9._-]` |
| `email` | string | único, normalizado para minúsculas |
| `password` | string | hash bcrypt (gancho `pre('save')`), mínimo 8, máximo 72 |

**Invariantes:** a senha **nunca** é serializada — `authController.publicUser()` projeta os campos
permitidos. Métodos: `findByEmailOrUsername()`, `matchPassword()`.

Um usuário **não** pertence a uma casa por si só: o vínculo é a `Membership`. Um usuário pode
estar em várias casas.

### Household

| Campo | Padrão | Notas |
|---|---|---|
| `name` | — | 2–80 |
| `timezone` | `America/Sao_Paulo` | **Define todo "dia" do produto** |
| `ownerId` | — | o owner original |
| `ratingWindowHours` | `72` | prazo para avaliar antes da auto-aprovação |
| `overdueGraceHours` | `0` | tolerância após o fim do dia de vencimento |
| `horizonDays` | `30` | quantos dias de ocorrências materializar à frente |
| `inviteCode` | — | `select: false` **e** omitido na serialização |
| `inviteCodeExpiresAt` | — | 7 dias |

**Invariantes:** o `inviteCode` nunca sai numa serialização comum — só pelas rotas dedicadas
`GET/POST /households/:id/invite`, que exigem papel `owner` ou `adult`.

### Membership

| Campo | Notas |
|---|---|
| `user`, `household` | par **único** (índice `{user, household}`) |
| `role` | `owner` \| `adult` \| `child` |
| `overrides` | sobreposições pontuais de capacidade; **omitido na serialização** |
| `joinedAt` | define a ordem do rodízio de responsáveis |

**Invariante central:** as capacidades efetivas são **sempre derivadas** de `role` + `overrides`
(`utils/capabilities.js`), nunca gravadas. Não existe estado de permissão que possa divergir do
papel. Expostas como o virtual `capabilities`.

| Capacidade | owner | adult | child |
|---|---|---|---|
| `canManageTasks` (criar/editar/arquivar tarefa, concluir qualquer ocorrência, pular) | ✅ | ✅ | ❌ |
| `canAssign` (designar responsável) | ✅ | ✅ | ❌ |
| `canRate` (avaliar execução de outro) | ✅ | ✅ | ❌ |
| `canManageMembers` | ✅ | ❌ | ❌ |

**Invariante do último owner:** a casa nunca fica sem `owner`. Rebaixar ou remover o último
retorna `409 LAST_OWNER_CANNOT_LEAVE`.

### Task

| Campo | Notas |
|---|---|
| `household` | obrigatório |
| `name`, `description` | 3–100 / até 500 |
| `recurrence` | a regra (ver §3) |
| `difficulty` | `muito_facil`…`muito_dificil` |
| `points` | derivado da dificuldade, sobreponível |
| `assignmentStrategy` | `fixed` (usa `assignedTo`) \| `rotate` (rodízio) |
| `assignedTo` | responsável fixo; `null` = qualquer membro |
| `status` | `active` \| `archived` |
| `archivedAt` | |
| `createdBy` | **auditoria apenas** — não define visibilidade nem permissão |
| `lastCompletedDate` | atualizado ao concluir |
| `occurrencesGeneratedUntil` | controle interno do gerador; **nunca serializado** |

**Pontuação:** `muito_facil`=1, `facil`=2, `medio`=3, `dificil`=5, `muito_dificil`=8.

**Invariantes:**
- `rotate` e `assignedTo` preenchido são incompatíveis → `400`.
- Excluir sem `?hard=true` **arquiva**; arquivar é o padrão porque apagar destruiria o histórico
  e o placar.
- Mudar a recorrência **não reescreve o passado** (ver §3.3).

### TaskOccurrence

A obrigação concreta e datada. É a unidade que o usuário vê na agenda.

| Campo | Notas |
|---|---|
| `dueDate` | **string `YYYY-MM-DD`**, o dia local da casa |
| `assignedTo` | responsável desta ocorrência (`null` = qualquer um) |
| `status` | `pending` \| `done` \| `overdue` \| `skipped` |
| `points` | **cópia** dos pontos vigentes no momento da geração |
| `completedAt`, `completedBy`, `skippedReason` | |
| `isLate` | **calculado na resposta**, não gravado |

**Invariante de idempotência:** índice **único** `{task, dueDate}`. Não existem duas ocorrências
da mesma tarefa no mesmo dia — é isso que permite rodar o gerador quantas vezes for sem duplicar.

### TaskExecution

| Campo | Notas |
|---|---|
| `occurrence`, `task`, `household` | |
| `dueDate` | **desnormalizado** da ocorrência; é o eixo de todo relatório |
| `executedBy`, `completionDate` | |
| `status` | `pending_review` \| `approved` \| `auto_approved` |
| `note` | comentário de quem **executou** |
| `rating` (1–5), `ratedBy`, `ratedAt`, `ratingNote` | nota e comentário de quem **avaliou** |
| `points` | cópia dos pontos da ocorrência na conclusão |

**Invariantes:**
- Só existe execução ligada a uma ocorrência.
- `note` e `ratingNote` são campos **separados**: a avaliação não sobrescreve o comentário de
  quem executou.
- O `dueDate` copiado não pode divergir: o `dueDate` de uma ocorrência nunca muda, e as únicas
  operações que apagam ocorrências levam as execuções junto.

### RevokedToken

`jti` (único) + `expiresAt` com **índice TTL**: o Mongo apaga sozinho quando o token expiraria
de qualquer forma. Existe porque JWT é stateless — sem isso, "sair" não invalidaria nada.

---

## 3. Recorrência

### 3.1 A regra

```yaml
recurrence:
  frequency: diaria | semanal | mensal | anual | ocasional
  interval:  1..52          # 2 + semanal = quinzenal
  weekdays:  [0..6]         # 0 = domingo; obrigatório no semanal
  dayOfMonth: 1..31         # mensal/anual
  startDate: 'YYYY-MM-DD'
  endDate:   'YYYY-MM-DD'   # opcional
```

### 3.2 Como as datas são expandidas

**Matemática de calendário pura** (`services/recurrence.js`), sem fuso: o fuso serve para dizer
*que dia é hoje*, não para calcular a série.

| Frequência | Comportamento |
|---|---|
| `diaria` | a cada `interval` dias a partir de `startDate` |
| `semanal` | nos `weekdays` escolhidos, a cada `interval` **semanas** (semana começando no domingo) |
| `mensal` | no `dayOfMonth`; **se o mês não tiver o dia, cai no último dia do mês** |
| `anual` | no mês/dia de `startDate`; 29/02 cai em 28/02 nos anos não bissextos |
| `ocasional` | **uma única** data: `startDate` |

```
mensal dia 31  →  2025-01-31 · 2025-02-28 · 2025-03-31 · 2025-04-30
anual  29/02   →  2024-02-29 · 2025-02-28 · 2026-02-28 · 2027-02-28
```

O ajuste para o último dia do mês é a razão de a expansão ser própria em vez de usar RRULE —
ver [DECISIONS.md § D5](./DECISIONS.md).

### 3.3 Alterar a recorrência

Mudar a regra **não reescreve o passado**. O que acontece:

1. as ocorrências **pendentes de hoje em diante** são apagadas;
2. o marcador do gerador recua para ontem;
3. a próxima geração usa a regra nova.

O que já foi concluído (e o histórico de execuções) permanece intacto.

---

## 4. Geração de ocorrências

`services/occurrences.js`. Três garantias:

**Horizonte.** O gerador materializa de hoje até `hoje + horizonDays`. **Não retrocede**: uma
tarefa diária com `startDate` de 2020 materializaria anos de ocorrências que ninguém vai fazer. A
agenda olha para a frente.

**Backfill.** Toda leitura de agenda chama `refreshHousehold` antes de responder. Se pedirem uma
janela além do horizonte, o que falta é gerado na hora. **O job diário é otimização, não requisito
de correção** — um servidor que ficou parado se reconstrói na primeira leitura.

**Idempotência.** A garantia não é uma checagem em memória: é o índice único `{task, dueDate}`.
Uma inserção duplicada falha com `11000` e é ignorada. Rodar o gerador duas vezes cria zero.

**Rodízio.** Com `assignmentStrategy: 'rotate'`, cada ocorrência recebe um membro em ordem
circular (por `joinedAt`), continuando de onde a anterior parou.

**Tarefa arquivada** deixa de gerar. As ocorrências pendentes **já materializadas permanecem** —
apagá-las esconderia trabalho que alguém ainda pode fazer.

---

## 5. Atraso

Uma ocorrência vira `overdue` quando o instante atual passa do **fim do dia de vencimento no fuso
da casa**, somado a `overdueGraceHours`.

```
prazo da ocorrência de 2025-07-10, casa em America/Sao_Paulo, tolerância 0
  = 2025-07-11T03:00:00Z   (fim do dia local)
```

Com tolerância 0, a ocorrência de **hoje não está atrasada** — o dia ainda não acabou.

A transição é persistida por um `updateMany` barato no início de cada leitura de agenda, para
que o filtro `status=overdue` continue sendo um filtro de índice.

**Desfazer não devolve "pending" cego:** a ocorrência volta ao estado que o calendário determina
hoje — `overdue` se o prazo já passou.

---

## 6. Ciclo de vida da execução

```
                    POST /occurrences/:id/complete
                                 │
                                 ▼
                          pending_review ────────────────┐
                            │        │                    │
      PATCH /executions/:id/rating   │        (janela de avaliação expira)
                            │        │                    │
                            ▼        │                    ▼
                        approved     │             auto_approved
                                     │             (rating: null)
                     POST /occurrences/:id/undo
                                     │
                                     ▼
                    execução APAGADA · ocorrência volta a pending/overdue
```

### Concluir

| Condição | Resultado |
|---|---|
| ocorrência `done` ou `skipped` | `409 OCCURRENCE_ALREADY_COMPLETED` |
| sem `canManageTasks` e a ocorrência é de outro membro | `403 OCCURRENCE_NOT_ASSIGNED_TO_YOU` |
| `completionDate` no futuro | `400` |
| `completionDate` há mais de **7 dias** | `400` |

Quem tem `canManageTasks` conclui qualquer ocorrência; quem não tem, apenas as próprias ou as
sem responsável. O registro retroativo existe para quem esqueceu de marcar — daí o limite de 7
dias, que evita reescrever o mês passado.

### Avaliar

| Condição | Resultado |
|---|---|
| é o próprio executador | `403 CANNOT_RATE_OWN_EXECUTION` |
| já avaliada ou auto-aprovada | `409 EXECUTION_ALREADY_RATED` |
| janela fechada | `409 RATING_WINDOW_CLOSED` |

`rating` é **obrigatório**; `note` é o comentário do avaliador (vai para `ratingNote`).

A ordem das checagens importa: status **antes** da janela, para que "avaliou duas vezes" e
"avaliou atrasado" sejam erros distintos.

### Auto-aprovação

Passado `ratingWindowHours` sem avaliação, a execução vira `auto_approved` com `rating: null`.
Ninguém fica preso a um avaliador ausente. Roda no job diário **e** em toda leitura de execuções.

### Desfazer

- Executa o `owner` a qualquer tempo; quem executou, enquanto a janela de avaliação estiver aberta.
- Caso contrário: `403 INSUFFICIENT_ROLE`.
- Não concluída: `409 OCCURRENCE_NOT_COMPLETED`.
- **A execução é apagada** — é assim que os pontos saem do placar, por consequência, sem ajuste
  manual. O evento vai para log de auditoria.

### Pular

Exige `canManageTasks`. Grava `skippedReason`. Não gera pontos e não conta como atraso.

---

## 7. Pontuação

Pontos entram no placar **apenas** quando a execução está `approved` ou `auto_approved`. O valor é
o que estava na ocorrência (`points`), copiado no momento da conclusão — mudar os pontos da tarefa
depois **não** reescreve o que já valeu.

---

## 8. Desempenho

### O eixo é sempre o vencimento

"A semana" significa **as tarefas cuja semana era esta**, não "o que foi marcado como feito nestes
sete dias". Isso mantém o relatório alinhado com a agenda. Consequência: uma ocorrência vencida no
domingo e concluída na segunda conta para a semana **anterior**.

### Janelas

| Período | Janela |
|---|---|
| `week` | semana **começando no domingo** |
| `month` | o mês corrente |
| `all` | da primeira ocorrência da casa até hoje |
| sem período (só `/stats`) | últimos 30 dias |

O período é o calendário **cheio**. Numa semana em andamento a taxa de conclusão parece baixa
porque de fato está: a semana não acabou.

### Os dois eixos de um membro

| Campo | Eixo |
|---|---|
| `points`, `completed`, `onTimeRate`, `avgRating` | **quem executou** (`executedBy`) |
| `overdue`, `skipped` | **quem foi designado** (`assignedTo`) |

São eixos diferentes de propósito: `assignedTo` costuma ser nulo ("qualquer um pode assumir"),
então agrupar tudo por ele deixaria a maior parte do trabalho sem dono.

**Todos os membros aparecem**, inclusive com zero — um ranking que esconde quem não fez nada
esconde exatamente a informação que interessa.

### Definições

| Métrica | Definição |
|---|---|
| `completionRate` | `done` / total de ocorrências na janela |
| `onTimeRate` | fração das execuções concluídas **até o fim do dia de vencimento** |
| `avgCompletionDelayHours` | média de (conclusão − fim do dia de vencimento), em horas. **Negativo = adiantado** |

---

## 9. Catálogo de erros

O contrato é a fonte de verdade (`ErrorCode` em `openapi.yaml`), e `utils/errorCodes.js` espelha.
**O cliente decide pelo `code`, nunca pelo texto da mensagem.**

| Faixa | Códigos |
|---|---|
| Entrada | `VALIDATION_ERROR`, `INVALID_DATE_RANGE` |
| Autenticação | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`, `USERNAME_ALREADY_REGISTERED`, `RATE_LIMITED` |
| Autorização | `FORBIDDEN`, `NOT_HOUSEHOLD_MEMBER`, `INSUFFICIENT_ROLE`, `HOUSEHOLD_NOT_FOUND`, `INVITE_CODE_INVALID`, `MEMBER_NOT_FOUND`, `DUPLICATE_MEMBER`, `LAST_OWNER_CANNOT_LEAVE` |
| Recursos | `ROUTE_NOT_FOUND`, `TASK_NOT_FOUND`, `TASK_ARCHIVED`, `OCCURRENCE_NOT_FOUND`, `OCCURRENCE_ALREADY_COMPLETED`, `OCCURRENCE_NOT_COMPLETED`, `OCCURRENCE_NOT_ASSIGNED_TO_YOU`, `EXECUTION_NOT_FOUND` |
| Regras | `EXECUTION_ALREADY_RATED`, `CANNOT_RATE_OWN_EXECUTION`, `RATING_WINDOW_CLOSED`, `CONFLICT` |
| Servidor | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` |

---

## 10. Invariantes que não podem ser violadas

Uma lista curta para consultar antes de mexer:

1. **Todo documento de domínio tem `household`.** Nada é global.
2. **Quem não é membro da casa não enxerga o recurso.** Em rota com `householdId`: `403
   NOT_HOUSEHOLD_MEMBER`. Em rota por id de recurso: **`404`**, para não vazar existência.
3. **Capacidade é sempre derivada**, nunca gravada.
4. **A casa nunca fica sem owner.**
5. **Uma ocorrência por `{task, dueDate}`.**
6. **Uma membership por `{user, household}`.**
7. **O `inviteCode` nunca aparece numa serialização comum.**
8. **A senha nunca é serializada.**
9. **O executor nunca avalia a própria execução.**
10. **Pontos só contam quando a execução está aprovada.**
11. **O passado não é reescrito** ao mudar recorrência.
12. **Dia de calendário é string `YYYY-MM-DD`**, comparada no fuso da casa.
13. **Erro sempre pelo envelope**, com código do catálogo e `requestId`.
14. **Entrada sempre validada por schema estrito** — campo fora do contrato é rejeitado.
