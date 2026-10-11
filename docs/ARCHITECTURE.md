# Arquitetura

Como o código está organizado, por onde uma requisição passa e **onde colocar coisa nova**.
Este é o documento para ler antes de escrever a primeira linha.

> Documentos irmãos: [DOMAIN.md](./DOMAIN.md) (regras de negócio), [DECISIONS.md](./DECISIONS.md)
> (por que está assim), [OPERATIONS.md](./OPERATIONS.md) (rodar e implantar),
> [FRONTEND.md](./FRONTEND.md) (consumir a API) e [openapi.yaml](./openapi.yaml) (o contrato).

---

## 1. O que é o sistema

Uma API para uma família dividir e acompanhar as tarefas de casa. A casa (**Household**) tem
membros com papéis; cada tarefa recorrente (**Task**) gera obrigações datadas
(**TaskOccurrence**); concluir uma ocorrência cria uma **TaskExecution**, que **outro** membro
avalia e que vale pontos.

O produto tem três telas previstas: **Tarefas**, **Cronograma** e **Desempenho** — e a API
existe para servi-las.

**Stack:** Node.js 22 · Express 4 · MongoDB (Mongoose 8) · zod 4 (validação) · luxon (fuso) ·
node-cron (job diário) · JWT + bcryptjs (sessão) · Jest + supertest + mongodb-memory-server (testes).

---

## 2. Mapa do código

```
backend/
├── server.js            ponto de entrada: conecta no banco, escuta a porta, sobe o job
├── app.js               monta o Express (não conecta, não escuta) — é o que os testes usam
├── config/
│   ├── index.js         lê e valida as variáveis de ambiente
│   ├── db.js            conexão com o MongoDB
│   └── serialization.js formato de saída dos documentos (id sem _id, sem __v)
├── routes/              só declaração de rotas: qual middleware, qual validação, qual handler
├── middlewares/         autenticação, autorização, validação, erro, requestId, limite
├── controllers/         traduzem HTTP ↔ serviço. Finos de propósito
├── services/            REGRAS DE NEGÓCIO. É aqui que mora o que o produto faz
├── models/              schema, índices, invariantes e ganchos do Mongoose
├── schemas/             schemas zod de ENTRADA (o que pode chegar)
├── utils/               peças pequenas e reutilizáveis
├── jobs/                agendador (node-cron)
├── scripts/             seed e gerador de volume
└── tests/               suíte completa (ver §7)
```

**A regra de ouro da separação:** `routes` não decide nada, `controllers` não contêm regra de
negócio, `services` não conhecem `req`/`res`. Se você está escrevendo um `if` de regra dentro de
um controller, ele provavelmente pertence a um serviço.

### O que cada serviço faz

| Arquivo | Responsabilidade |
|---|---|
| `services/recurrence.js` | Expande uma regra de recorrência em datas. **Matemática de calendário pura** — nenhum fuso entra aqui |
| `services/time.js` | O **único** lugar que traduz instante ↔ "dia da casa". Fuso horário vive só aqui |
| `services/occurrences.js` | Gerador de ocorrências (idempotente) + backfill + marcação de atraso |
| `services/executions.js` | Ciclo de vida da execução: concluir, pular, desfazer, avaliar, auto-aprovar |
| `services/stats.js` | Agregações de desempenho (tudo no MongoDB, via pipeline) |

---

## 3. O caminho de uma requisição

```
POST /api/v1/households/:id/tasks
  │
  ├─ requestId        gera/reaproveita X-Request-Id e devolve no header
  ├─ helmet           cabeçalhos de segurança
  ├─ cors             libera a origem (ALLOWED_ORIGINS)
  ├─ cookieParser     lê o cookie jwt_token
  ├─ express.json     corpo em JSON
  ├─ routes/index.js  monta em /api/v1 (e em /api, alias legado)
  │
  ├─ requireAuth      valida o JWT, checa revogação, carrega req.user
  ├─ requireMember    carrega req.household e req.membership (a casa existe? sou membro?)
  ├─ authorize(...)   a capacidade do papel permite?      (ou requireRole(...))
  ├─ validate({...})  zod valida a entrada e SUBSTITUI req.body pelo valor tipado
  └─ asyncHandler(controller.create)
        │
        ├─ controller  lê req.validatedQuery / req.body, chama o serviço
        ├─ service     aplica a regra, lança ApiError quando algo não bate
        └─ respond     ok/created/noContent → { data, meta }
```

Qualquer `throw` no caminho é capturado pelo `asyncHandler` e entregue ao `errorHandler`, que
escreve **o único formato de erro existente**:

```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "...", "details": [], "requestId": "..." } }
```

**Nenhum controller deve usar `res.json` direto nem montar corpo de erro à mão.** Use
`utils/respond.js` para sucesso e `ApiError` para falha.

---

## 4. Convenções

| Assunto | Convenção |
|---|---|
| Idioma do código | Identificadores e comentários em **português sem acento** (evita problema de encoding em ferramenta antiga); o contrato OpenAPI e os documentos são em português com acento |
| Datas do domínio | **String `YYYY-MM-DD`** (dia local da casa). Nunca `Date` para dia de calendário |
| Instantes | `Date`/`ISO 8601 UTC` só para "quando algo aconteceu" |
| Comparar dias | Comparação lexicográfica de strings — funciona e não tem fuso para errar |
| Erros | Sempre `ApiError`, sempre com código do catálogo (`utils/errorCodes.js`) |
| Validação | Sempre zod, sempre `.strictObject` (campo fora do contrato é rejeitado) |
| Índices | Todo campo usado em filtro de listagem precisa de índice declarado no modelo |
| Comentários | Explicam **por que**, não o que. Se o código já diz o que faz, o comentário é ruído |
| Testes | Uma suíte por área, nomes de `it` descrevendo o comportamento em português |

---

## 5. Receituário

### 5.1 Adicionar um endpoint

1. **Contrato primeiro.** Acrescente o caminho em `docs/openapi.yaml` e rode
   `npx @redocly/cli lint docs/openapi.yaml`. Se o lint reclamar, o desenho ainda não está pronto.
2. **Modelo de entrada** em `schemas/` (`.strictObject`). Se precisar validar query, use
   `z.coerce` para números e uma união explícita para booleanos (`'true'`/`'false'`).
3. **Rota** no arquivo de `routes/` correspondente. A ordem típica dos middlewares é:
   `requireAuth → requireMember → authorize/requireRole → validate → asyncHandler`.
4. **Serviço**, se houver regra de negócio. O controller não deve conter `if` de regra.
5. **Controller** fino: chama o serviço, responde com `ok`/`created`/`noContent`.
6. **Teste** em `tests/`, incluindo **o caso negado** (sem token, papel errado, outra casa).

> Rota aninhada numa casa? Crie um router com `express.Router({ mergeParams: true })` e monte-o
> em `routes/household.js`. É assim que `/households/:id/tasks` funciona.
>
> Rota por id, sem `householdId` no caminho? O escopo vem do **recurso**: use um middleware
> como `middlewares/task.js`, que carrega a tarefa e resolve a membership a partir da casa dela.

### 5.2 Adicionar um campo

1. **Contrato**: em `docs/openapi.yaml`, no schema e nos request bodies.
2. **Modelo**: no `models/`. Se for derivável, prefira um **virtual** a um campo gravado.
3. **Schema zod** da entrada, se o cliente puder enviá-lo.
4. **Serviço/controller** que o utiliza.
5. **Teste** que o exercita — inclusive a rejeição quando o campo não é aceito.

### 5.3 Adicionar um modelo

1. Schema com `timestamps: true` e `toObject/toJSON: createJsonOptions()` (de
   `config/serialization.js`) — sem isso o `_id` vaza na resposta.
2. **`household` obrigatório** e indexado: é o isolamento entre casas.
3. Índices para as consultas reais (não para as imaginárias).
4. Se o documento é aninhado em outro, use `{ _id: false }`.

### 5.4 Adicionar uma regra de negócio

Vá para um `services/`. Escreva o teste **antes** de plugar na rota: as regras desta API têm
pré-condições (papel, estado, janela de tempo) e testá-las pela borda HTTP é mais lento e menos
claro do que chamando o serviço.

**Relógio:** funções sensíveis ao tempo recebem `options.now`. Nunca dependa do relógio global —
ver [DECISIONS.md § D6](./DECISIONS.md).

### 5.5 Mexer no contrato

1. Edite `docs/openapi.yaml`.
2. `npx @redocly/cli lint docs/openapi.yaml` (precisa sair **valid, 0 warnings**).
3. Implemente.
4. Se mudou semântica (não só forma), registre em `docs/DECISIONS.md`.

---

## 6. Armadilhas conhecidas

Coisas que já custaram tempo neste projeto. Cada uma tem o porquê em [DECISIONS.md](./DECISIONS.md).

1. **`ObjectId.id` devolve o buffer binário**, não a string hexadecimal. Em documento do
   Mongoose, `.id` é o virtual (string); em `ObjectId` cru, é bytes. Use `String(_id)`.
2. **`select: false` esconde de consulta, mas não de um documento recém-criado.** Um campo
   sensível precisa também ser omitido na serialização.
3. **Documento populado é serializado pelo `toObject` do schema filho**, não pelo `toJSON` do pai.
   Por isso os modelos configuram os dois.
4. **Express 4 não captura rejeição de promise.** Todo handler assíncrono precisa de
   `asyncHandler`.
5. **`req.query` é um getter** — não dá para reatribuir. Por isso a validação de query grava em
   `req.validatedQuery`.
6. **`z.coerce.boolean()` transforma a string `"false"` em `true`.** Use união de literais.
7. **Aggregation não converte string para ObjectId.** Num `$match`, faça o cast explícito.
8. **Índice único `{task, dueDate}`**: não existem duas ocorrências da mesma tarefa no mesmo dia.
   Isso não é limitação, é a garantia de idempotência do gerador.
9. **O Mongo só aplica a senha de root na primeira inicialização** do volume. Trocar
   `MONGO_PASSWORD` com volume existente derruba a conexão.
10. **Arquivo com permissão `600` quebra a imagem de produção**, porque o processo roda como
    usuário `node`. O Dockerfile usa `COPY --chown=node:node`.

---

## 7. Testes

```bash
cd backend
npm test              # tudo
npm run test:watch    # durante o desenvolvimento
npx jest tests/stats.test.js   # uma suíte
```

**Como está montado:** cada arquivo de teste sobe **o seu próprio MongoDB em memória**
(`mongodb-memory-server`) e o derruba no fim. O banco é limpo entre os casos. Por isso o
`app.js` **não** conecta sozinho — quem conecta é o `server.js`, e nos testes o harness assume
esse papel (`tests/setup.js` + `tests/helpers/db.js`).

**Convenções:**

- Um arquivo por área do domínio (`tasks`, `occurrences`, `executions`, `stats`, `households`…).
- `tests/helpers/auth.js` monta cenário (usuário com token, casa, membro por convite).
- `tests/helpers/fixtures.js` cria tarefa e ocorrência direto no modelo — para estados que o
  gerador não produz sozinho (uma ocorrência vencida no passado, por exemplo).
- **Prefira o caminho real da API.** A criação de execução, por exemplo, é testada por
  `POST /occurrences/:id/complete`, não gravando no modelo.
- Todo caso de autorização tem o **teste negado** correspondente. É o requisito do
  [Definition of Done](./ROADMAP.md).
- O limite de tentativas vem **desligado** por padrão nos testes (`tests/setup.js`); o arquivo
  que testa o próprio limite o religa antes de importar o app (`tests/hardening.test.js`).

---

## 8. O que NÃO existe (de propósito)

Antes de "completar" algo abaixo, verifique se não é uma decisão consciente.

| Ausência | Por quê |
|---|---|
| Camada de repositório | Os serviços falam com o Mongoose direto; a indireção não se pagaria nesta escala |
| Injeção de dependência | O custo de montar um contêiner seria maior que o benefício aqui |
| Transações no Mongo | Exigem replica set; a alternativa (índice único + operações idempotentes) resolve os casos reais |
| WebSocket / tempo real | A agenda é consultada por requisição; o app não é colaborativo em tempo real |
| GraphQL | O contrato REST é o acordado com o front |
| Testes de unidade com mock do Mongoose | Os testes de integração com banco real pegam mais e são quase tão rápidos |
| `faker`/dados aleatórios nos testes | Números exatos com fixture conhecida provam mais que aproximações |
