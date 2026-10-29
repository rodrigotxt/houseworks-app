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
| `freeTime` | tempo livre por dia para as tarefas; `null` = nunca configurado (D34) |
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
| `canManageReminders` (criar/editar lembrete de qualquer membro, e para todos) | ✅ | ✅ | ❌ |

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
| `estimatedMinutes` | quanto tempo leva, em minutos; `null` = não estimado. **Nenhuma regra depende dele** (D33) |
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
| `estimatedMinutes` | cópia da estimativa da tarefa na conclusão; `null` = não tinha |
| `actualMinutes` | tempo medido, **só** quando informado; `null` = não informado (D36) |

**Invariantes:**
- Só existe execução ligada a uma ocorrência.
- `note` e `ratingNote` são campos **separados**: a avaliação não sobrescreve o comentário de
  quem executou.
- O `dueDate` copiado não pode divergir: o `dueDate` de uma ocorrência nunca muda, e as únicas
  operações que apagam ocorrências levam as execuções junto.


### Reminder

O aviso. Diferente da tarefa, **não gera ocorrência, execução, nota nem ponto** — ele só
precisa chegar na hora. É o que cobre "tomar o remédio às 21h", "conferir se a máquina já
pode lavar" e "checar se a tarefa foi feita".

| Campo | Notas |
|---|---|
| `household` | obrigatório, como todo documento de domínio |
| `title`, `notes` | 3–100 / até 500 |
| `createdBy` | quem criou; limita a criança, que só administra os próprios |
| `schedule` | recorrência (mesma da tarefa) **+ `time` local da casa** |
| `recipients` | destinatários explícitos; vazio quando `allMembers` |
| `allMembers` | "todos", resolvido **no disparo** contra a Membership |
| `channels` | `in_app`, `push` (hoje); `email`, `sms` reservados |
| `task` | vínculo opcional: "conferir se foi feita" |
| `skipIfTaskDone` | com tarefa, não avisa quando a ocorrência do dia já está `done`/`skipped` |
| `status` | `active` / `paused` / `archived` |
| `firingsGeneratedUntil` | controle interno do gerador; nunca serializado |

**Invariantes:**
- `allMembers` e `recipients` se excluem: um dos dois, nunca os dois.
- Todo destinatário precisa ser membro da casa.
- Canal indisponível nesta instalação é recusado na criação (`CHANNEL_NOT_AVAILABLE`) —
  aceitar um canal que nunca entrega seria pior que recusar.
- **Criança cria e edita apenas os próprios lembretes, e apenas para si.** Adulto e owner
  (capacidade `canManageReminders`) criam para qualquer membro e para todos.
- Um lembrete `ocasional` (disparo único) é arquivado depois de tocar.

### ReminderFiring

O disparo materializado: o instante concreto em que o lembrete toca. É o espelho da
`TaskOccurrence`, com outro recorte — a ocorrência é uma obrigação; o disparo é um aviso.

| Campo | Notas |
|---|---|
| `reminder`, `household` | |
| `fireAt` | instante **UTC**; é o que o despachante compara |
| `localDate`, `localTime` | dia e hora locais da casa, desnormalizados |
| `kind` | `schedule` / `snooze` (adiamento de uma pessoa) |
| `user` | só no `snooze` |
| `status` | `scheduled` → `processing` → `delivered`, `skipped`, `cancelled` ou `missed` |
| `reason` | `tarefa_concluida`, `sem_destinatarios`, `janela_expirada`, … |

**Invariante de idempotência:** índice **único** `{reminder, fireAt, user}`. Não existem
dois disparos do mesmo lembrete no mesmo instante — é isso que permite o job rodar em
duas réplicas sem entregar duas vezes.

### ReminderDelivery

A entrega para **uma pessoa** — a unidade da caixa de notificações.

| Campo | Notas |
|---|---|
| `firing`, `reminder`, `household`, `user` | |
| `channels` | resultado por canal: `sent`, `skipped` ou `failed`, com motivo |
| `readAt` | viu |
| `acknowledgedAt` | resolveu ("feito") |

**Invariantes:**
- **Uma entrega por `{firing, user}`** (índice único).
- `readAt` e `acknowledgedAt` são **separados**: ler não é resolver.
- "Feito" **não interrompe a recorrência** — o remédio de hoje não cancela o de amanhã.
- O canal é por entrega: o push pode falhar no aparelho de um filho enquanto o in_app
  funciona para todos.

### PushSubscription

Inscrição de Web Push de um **aparelho**. É a **exceção consciente** à invariante "todo
documento de domínio tem `household`": o aparelho é do usuário, não da casa, e o mesmo
celular recebe avisos de duas casas. Como `RevokedToken`, é documento de
identidade/infraestrutura.

**Invariantes:** o `endpoint` é único; as chaves (`p256dh`, `auth`) nunca são
serializadas. Um 404/410 do serviço de push remove a inscrição morta.

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


## 9. Lembretes

### 9.1 O que é e o que não é

Um lembrete é um **aviso**, não um dever. Não há ocorrência, execução, nota, ponto nem
placar. O que ele tem é hora, destinatários e canais.

Isso permite os casos que a tarefa não cobre bem: tomar um remédio todos os dias às 21h,
conferir se a máquina já pode lavar, ou ser avisado de uma tarefa que **ainda não foi
feita** (o vínculo com `task`).

### 9.2 Recorrência e hora

O `schedule` reaproveita a mesma expansão de §3 (`diaria`, `semanal`, `mensal`,
`anual`, `ocasional`) e acrescenta **`time`**, a hora local da casa. `ocasional` é o
disparo único.

A conversão de "21:00 na casa" para instante absoluto acontece **só** em
`services/reminders.js` (`fireAtFor`), com o fuso da `Household`. O resto do domínio
continua comparando strings de dia.

### 9.3 Disparo: materializar, despachar, entregar

`@
Reminder (regra)
   |  materializa até 7 dias à frente
   v
ReminderFiring (instante concreto, status scheduled)
   |  job de cada minuto / claim atômico
   v
ReminderDelivery (uma por destinatário)
   |  canais: in_app, push
   v
caixa de notificações + serviço de push do navegador
`@

Três garantias:

1. **Idempotência** pelo índice único `{reminder, fireAt, user}` — não por checagem em
   memória.
2. **Janela curta**: um disparo atrasado mais de 10 minutos vira `missed`, não chega fora
   de hora. Remédio às 21h entregue às 9h do dia seguinte é pior que nenhum aviso. Por
   isso **não há backfill do passado**, ao contrário das ocorrências.
3. **Sem duplicação entre réplicas**: o disparo é reivindicado com
   `findOneAndUpdate({status:'scheduled'} → 'processing')`.

A leitura da lista materializa os próximos disparos (como a agenda faz backfill); o job
de cada minuto é quem **despacha**. Sem o job, nada toca.

### 9.4 Canais

| Canal | Hoje | Como chega |
|---|---|---|
| `in_app` | sempre | a própria `ReminderDelivery` na caixa de notificações |
| `push` | se o servidor tiver VAPID | Web Push do PWA, por aparelho inscrito |
| `email`, `sms` | não | reservados no contrato; criação recusa |

Um canal que falha não derruba os outros: o in_app é gravado mesmo quando o push do
aparelho morre. O resultado de cada canal fica registrado na entrega.

### 9.5 Feito, adiar e "todos"

- **Feito** marca a última notificação como lida e resolvida. **Não** desliga a
  recorrência — é o que impede que tomar o remédio hoje cancele o de amanhã.
- **Adiar** cria um disparo `snooze` só para quem pediu, daqui a N minutos (1–1440).
  O adiamento é individual.
- **Todos** é dinâmico: resolvido contra a `Membership` no momento do disparo. Quem entra
  na casa depois passa a receber; quem sai para de receber.

### 9.6 Lembrete vinculado a tarefa

Com `task` preenchida e `skipIfTaskDone` (padrão `true`), o disparo é **pulado**
quando a ocorrência daquele dia já está `done` ou `skipped`. É o caso "checar se a
tarefa foi concluída": o sistema checa, e só incomoda quando ainda falta. O pulo fica
registrado com `reason: 'tarefa_concluida'`.

---

## 10. Catálogo de erros

O contrato é a fonte de verdade (`ErrorCode` em `openapi.yaml`), e `utils/errorCodes.js` espelha.
**O cliente decide pelo `code`, nunca pelo texto da mensagem.**

| Faixa | Códigos |
|---|---|
| Entrada | `VALIDATION_ERROR`, `INVALID_DATE_RANGE` |
| Autenticação | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`, `USERNAME_ALREADY_REGISTERED`, `RATE_LIMITED` |
| Autorização | `FORBIDDEN`, `NOT_HOUSEHOLD_MEMBER`, `INSUFFICIENT_ROLE`, `HOUSEHOLD_NOT_FOUND`, `INVITE_CODE_INVALID`, `MEMBER_NOT_FOUND`, `DUPLICATE_MEMBER`, `LAST_OWNER_CANNOT_LEAVE` |
| Recursos | `ROUTE_NOT_FOUND`, `TASK_NOT_FOUND`, `TASK_ARCHIVED`, `OCCURRENCE_NOT_FOUND`, `OCCURRENCE_ALREADY_COMPLETED`, `OCCURRENCE_NOT_COMPLETED`, `OCCURRENCE_NOT_ASSIGNED_TO_YOU`, `EXECUTION_NOT_FOUND`, `REMINDER_NOT_FOUND`, `DELIVERY_NOT_FOUND` |
| Lembretes e canais | `REMINDER_NOT_ASSIGNED_TO_YOU`, `CHANNEL_NOT_AVAILABLE`, `PUSH_NOT_CONFIGURED` |
| Regras | `EXECUTION_ALREADY_RATED`, `CANNOT_RATE_OWN_EXECUTION`, `RATING_WINDOW_CLOSED`, `CONFLICT` |
| Servidor | `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` |

---

## 11. Invariantes que não podem ser violadas

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
15. **Um lembrete tem destinatários OU `allMembers`**, nunca os dois; todo destinatário é
    membro da casa.
16. **Um disparo por `{reminder, fireAt, user}`** — é o que impede entrega dupla.
17. **Criança só cria e edita lembrete para si**; "todos" exige `canManageReminders`.
18. **"Feito" não interrompe a recorrência** — só resolve aquela notificação, para aquela
    pessoa.
19. **Push é por aparelho, não por casa** (`PushSubscription` não carrega `household`).
