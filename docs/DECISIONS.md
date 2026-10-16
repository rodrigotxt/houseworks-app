# Registro de decisões técnicas

Cada entrada diz **o que foi decidido, o que foi descartado e por quê**. Serve para que a decisão
não seja reaberta sem motivo — e para que, se for reaberta, o custo já seja conhecido.

Formato: contexto → decisão → alternativa descartada → consequência.

> Registro histórico das fases em [ROADMAP.md](./ROADMAP.md). Regras de negócio em
> [DOMAIN.md](./DOMAIN.md).

---

## A. Modelo de domínio e isolamento

### D1 — Multi-casa no schema, desde o primeiro commit

**Contexto.** O produto é uma família por instalação. Mas o modelo herdado era *user-centric*: a
tarefa pertencia a quem a criou, e o filho não enxergava a tarefa do pai.

**Decisão.** Todo documento de domínio carrega `household`. Não há UI de gestão de casas, mas o
isolamento é estrutural.

**Descartado.** "Uma família por instalação, sem tenancy": aceitável se o produto nunca sair de
casa, mas adicionar tenancy depois exige migrar todas as coleções, reescrever a autorização e
refazer os índices. O custo de reverter é assimétrico — barato agora, caro depois.

**Consequência.** Um campo obrigatório, um middleware e um índice composto em cada coleção.

### D16 — Capacidades derivadas do papel, nunca gravadas

**Contexto.** Era preciso expressar "o filho não cria tarefa, mas o adulto sim", com exceções
pontuais possíveis.

**Decisão.** A `Membership` guarda `role` + `overrides`. As capacidades efetivas são **calculadas**
a cada verificação (`utils/capabilities.js`) e expostas como virtual.

**Descartado.** Gravar um objeto `capabilities` no documento: criaria um segundo estado de
permissão, que pode divergir do papel quando alguém muda um e esquece o outro.

**Consequência.** Nenhuma migração quando as regras de papel mudarem; o custo é um cálculo
trivial por requisição.

### D17 — `404` em vez de `403` para recurso de outra casa

**Contexto.** Rotas como `GET /tasks/:taskId` não recebem `householdId`. Responder `403` para uma
tarefa de outra casa confirma que **aquele id existe**.

**Decisão.** Em rota por id de recurso, quem não é membro da casa recebe `404` — indistinguível de
"não existe". `403 NOT_HOUSEHOLD_MEMBER` fica reservado para rotas que explicitam a casa no
caminho, onde a existência dela já é conhecida.

**Consequência.** Um cliente não consegue enumerar ids de outras casas.

### D33 — Estimativa de tempo é dado de conveniência, e `null` limpa

**Contexto.** A tarefa sabia quanto *vale* (pontos) mas não quanto *demora*. Sem isso não dá
para olhar a agenda de sábado e saber se cabe — que é a pergunta que a casa realmente faz.

**Decisão.** `estimatedMinutes`: inteiro de 1 a 1440, **nulável**. Fora de `required` no
contrato, como `assignedTo`. Um `null` explícito **limpa** a estimativa; omitir a chave não a
toca.

**Descartado.**

- **Derivar da dificuldade**, como os pontos fazem. Não funciona: dificuldade não prediz
  duração. Limpar o banheiro é `dificil` e rápido; passar o aspirador é `medio` e demorado. Os
  pontos medem o *peso* da tarefa, não o *tempo* dela — são eixos diferentes.
- **Obrigatório.** Boa parte das tarefas não tem duração previsível, e exigir um número
  inventado só para preencher o campo produziria dado ruim.
- **Texto livre** ("meia hora", "a manhã toda"). Não dá para somar depois, e a soma é
  justamente para o que o campo existe.

**Consequência.** É o primeiro campo do domínio que existe para ser **exibido**, não para
decidir: nenhuma regra de negócio o consulta, e nulo nunca impede nada. O teto de 1440 (24h) é
barreira contra erro de digitação, não uma regra de negócio.

O ajuste que isso exigiu no cliente também vale como aviso: a Server Action de atualização
desestrutura os campos um a um, então um campo novo esquecido nessa lista **some sem erro
nenhum** — o formulário parece não salvar. Criar passava (o corpo vai inteiro), editar não.

---

## B. Tempo e recorrência

### D7 — Dia de calendário é string `YYYY-MM-DD`

**Contexto.** O servidor roda em UTC e a família vive em `America/Sao_Paulo`. Guardar o vencimento
como `Date` significa decidir, em cada comparação, se está comparando o dia certo.

**Decisão.** Datas de calendário são strings `YYYY-MM-DD` do **dia local da casa**. Instantes
("quando foi concluído") continuam sendo `Date` UTC.

**Consequência.** Comparar dias vira comparação de strings (ordenação lexicográfica de ISO 8601
funciona), e a classe de bug "venceu ontem às 21h em São Paulo mas já é hoje em UTC" deixa de
existir. O preço é que toda conversão instante ↔ dia passa por `services/time.js`, o único lugar
autorizado a conhecer fuso.

### D5 — Expansão de recorrência própria, sem RRULE

**Contexto.** O plano inicial era usar RRULE (iCalendar). O contrato, porém, exige que uma regra
"todo dia 31" caia no **último dia** dos meses que não têm 31 — fevereiro inclusive.

**Decisão.** Expansão própria em `services/recurrence.js`, com matemática de calendário pura
(nenhum fuso entra).

**Descartado.** RRULE: o `BYMONTHDAY` do iCalendar **pula** os meses que não têm o dia, em vez de
ajustar. Cumprir o contrato com RRULE exigiria uma segunda passada para "consertar" os meses
faltantes — mais código e mais obscuro do que expandir direto.

**Consequência.** `2025-01-31 → 2025-02-28 → 2025-03-31 → 2025-04-30` e `29/02 → 28/02`. Como a
expansão não conhece fuso, ela é testável borda por borda sem banco (`tests/recurrence.test.js`).

### D6 — Relógio injetado em vez de *fake timers*

**Contexto.** O gerador e a marcação de atraso dependem de "agora". Testar isso com `jest.useFakeTimers`
é o caminho óbvio.

**Decisão.** As funções sensíveis ao tempo recebem `options.now`. Os testes passam um instante fixo.

**Descartado.** Congelar o `Date` global: atrapalha o Mongoose e o próprio MongoDB em memória, que
usam temporizadores internamente. O teste fica frágil por um motivo que não tem a ver com o que
está sendo testado.

**Consequência.** Testes de tempo determinísticos e independentes do relógio da máquina.

### D14 — Auto-aprovação no job diário **e** na leitura

**Contexto.** Passada a janela de avaliação, a execução precisa virar `auto_approved` — senão
ninguém recebe os pontos porque o avaliador não apareceu.

**Decisão.** A varredura roda no job diário e também no início de toda leitura de execuções.

**Descartado.** Só no job: um servidor que ficou parado (deploy, container caído) deixaria execuções
presas em `pending_review` por tempo indeterminado.

**Consequência.** Um `updateMany` barato por leitura. O job continua existindo como otimização.

### D15 — Backfill na leitura; o job é otimização

**Contexto.** As ocorrências precisam existir antes de serem lidas. A agenda não pode depender de o
job ter rodado.

**Decisão.** Toda leitura de agenda chama `refreshHousehold` antes de responder: gera o que falta
até a janela pedida e marca o atraso.

**Descartado.** Confiar só no cron: a primeira leitura após qualquer parada mostraria uma agenda
vazia ou incompleta, e o usuário não teria como saber que era um problema de agendamento.

**Consequência.** O cron pode até não existir que a API continua correta — só mais lenta na primeira
leitura do dia.

---

## C. Materialização e desempenho

### D2 — Ocorrências materializadas

**Contexto.** Uma tarefa tem uma regra de recorrência. As obrigações poderiam ser calculadas na
hora da leitura ou gravadas.

**Decisão.** Materializar: cada ocorrência é um documento com `dueDate`, responsável e status.

**Descartado.** Calcular sob demanda: sem registro persistido não existe "atrasada", não existe
histórico por ocorrência, não existe "quem fez no dia X" e não existe agregação barata.

**Consequência.** Um gerador idempotente (garantido por índice único) e o dobro de documentos.
Em troca, todo o resto do produto fica expressável.

### D8 — Vencimento desnormalizado na execução

**Contexto.** Todo relatório tem o vencimento da ocorrência como eixo. A primeira implementação
partia das execuções e juntava cada uma com a sua ocorrência: **50 mil junções e 15 segundos** num
relatório de histórico completo.

**Decisão.** `TaskExecution.dueDate`, copiado na conclusão, com índice `{household, dueDate, status}`.

**Descartado.** Manter o `$lookup`: o custo de agregação passava a acompanhar o tamanho da **casa**,
não o da janela consultada.

**Consequência.** `/stats` de histórico completo caiu de 14 909ms para 662ms; as janelas realistas
ficaram entre 38ms e 53ms. A cópia não pode divergir: o `dueDate` de uma ocorrência nunca muda, e
as únicas operações que apagam ocorrências levam as execuções junto.

### D21 — Agregação no banco, nunca na aplicação

**Decisão.** Todo número de desempenho sai de `aggregation pipeline`. O Node não soma, o cliente
não soma.

**Descartado.** Trazer documentos e somar em JavaScript: transferiria dezenas de milhares de
documentos pela rede para produzir cinco linhas de resultado.

### D18 — Semana começando no domingo

**Decisão.** `period=week` vai de domingo a sábado, e o período é o **calendário cheio**.

**Descartado.** Segunda-feira (padrão ISO): inconsistente com `weekdays` da recorrência, onde
`0` já é domingo. Usar "até hoje" em vez do calendário cheio tornaria a taxa de conclusão da semana
corrente artificialmente alta.

**Consequência.** Numa semana em andamento a taxa parece baixa — porque de fato está.

### D19 — Todos os membros no ranking, inclusive com zero

**Decisão.** O ranking e o relatório listam todos os membros da casa.

**Descartado.** Listar só quem teve atividade: numa casa de cinco pessoas isso esconde justamente
quem não fez nada, que é a informação que o produto existe para mostrar.

### D20 — Dois eixos para medir um membro

**Decisão.** `points`, `completed`, `onTimeRate` e `avgRating` são medidos por **quem executou**;
`overdue` e `skipped`, por **quem foi designado**.

**Descartado.** Um eixo só: `assignedTo` é frequentemente nulo ("qualquer um pode assumir"), então
agrupar tudo por ele deixaria a maior parte do trabalho sem dono.

**Consequência.** Os campos de um mesmo objeto vêm de fontes diferentes — está documentado no
contrato e em [DOMAIN.md § 8](./DOMAIN.md) para não parecer inconsistência.

---

## D. Sessão e segurança

### D9 — O JWT carrega só a identidade

**Contexto.** O token poderia carregar `householdId` e `role` para economizar consultas.

**Decisão.** O token carrega apenas `sub` (e `jti`). Casa e papel são resolvidos por requisição
contra a `Membership`.

**Descartado.** Embutir papel no token: um usuário pode pertencer a várias casas, e o papel mudaria
só quando o token expirasse — "promovi meu filho a adulto e nada aconteceu por uma hora".

**Consequência.** Uma consulta a mais por requisição (mitigada pelo índice `{user, household}`).

### D10 — Revogação em coleção com TTL, não em Redis

**Contexto.** Logout num JWT stateless não invalida nada. Sem revogação, "sair" só apaga o cookie e
um token copiado continua válido até expirar.

**Decisão.** `RevokedToken` com `jti` único e índice **TTL** em `expiresAt`: o Mongo apaga o
registro quando o token expiraria de qualquer forma.

**Descartado.** Redis: mais uma peça de infraestrutura para operar e instalar, num produto que já
tem MongoDB. Guardar a lista em memória: quebraria com mais de uma réplica.

**Consequência.** Uma consulta indexada por requisição autenticada, numa coleção minúscula.

### D11 — Refresh rotaciona o token

**Decisão.** `POST /auth/refresh` revoga o token apresentado e emite um novo.

**Descartado.** Apenas emitir outro: uma sessão renovada deixaria **dois** tokens válidos
circulando, dobrando a superfície de um vazamento.

### D28 — Rotação de segredos, não limpeza de histórico

**Contexto.** O `.env` estava versionado com `JWT_SECRET` e a senha do Mongo (achado P9).

**Decisão.** Remover do controle de versão, gerar valores novos e documentar o molde em
`.env.example`.

**Descartado.** Reescrever o histórico do Git: os valores permanecem em qualquer clone, fork ou
cache. Um segredo publicado vale tanto quanto nenhum — a única correção real é trocá-lo.

**Consequência.** Trocar a senha do Mongo exige **recriar o volume**, porque o Mongo só aplica a
senha de root na primeira inicialização. Está avisado no `.env.example`.

---

## E. Contrato e erros

### D4 — Envelope único e catálogo de códigos

**Contexto.** O baseline respondia `{ message }`, o recurso cru, e às vezes
`res.status(500).send('texto')`. O front teria de tratar cada endpoint de um jeito.

**Decisão.** Sucesso é `{ data, meta }`; erro é `{ error: { code, message, details, requestId } }`,
com `code` vindo de um catálogo fechado.

**Consequência.** O cliente decide pelo **código**, nunca pelo texto — o que permite mudar a
mensagem (ou traduzir) sem quebrar ninguém.

### D29 — O 429 usa o mesmo envelope de erro

**Decisão.** O limite de tentativas responde pelo `errorHandler` central, igual a qualquer erro.

**Descartado.** Deixar o `express-rate-limit` responder no formato dele: seria mais um formato de
resposta para o front tratar, num caso (login) onde já existe um caminho de erro bem exercitado.

### D30 — Origem não autorizada no CORS não vira erro 500

**Decisão.** Origem fora da lista simplesmente não recebe os cabeçalhos de CORS; a requisição segue.

**Descartado.** `callback(new Error(...))`: produzia um 500 sem relação com o problema real e
poluía o log, escondendo a causa de quem estivesse depurando. Quem bloqueia é o navegador — que é
o comportamento correto e o que aconteceria de todo modo.

### D32 — Validação com zod antecipada para a Fase 0

**Contexto.** O plano previa validação de entrada só na Fase 5.

**Decisão.** Antecipada para a Fase 0, junto com o envelope.

**Motivo.** O formato do erro de validação (`details` com campo e problema) faz parte do envelope.
Definir o envelope sem definir isso deixaria a decisão pela metade — e o mass-assignment
(`PUT /tasks/:id` aceitava `status` arbitrário) só fecha com allow-list estrita.

---

## F. Ciclo de execução

### D12 — Desfazer **apaga** a execução

**Contexto.** O contrato diz que desfazer "remove a execução associada, incluindo os pontos já
computados".

**Decisão.** Apagar o documento, registrando o evento em log de auditoria (`utils/audit.js`).

**Descartado.** Marcar como revertida: exigiria filtrar `status != reverted` em **toda** agregação
de pontos — um lugar a mais para esquecer. Apagando, os pontos saem do placar por consequência,
sem nenhum ajuste manual.

**Consequência.** O histórico de tentativas de uma ocorrência normalmente tem 0 ou 1 registro. Se
auditoria consultável virar requisito, o log estruturado vira coleção sem mudar o ponto de chamada.

### D13 — Status **antes** da janela, ao avaliar

**Decisão.** Checar "já foi avaliada" antes de "a janela fechou".

**Motivo.** As duas condições são verdadeiras ao mesmo tempo depois da auto-aprovação. A ordem
define qual erro o cliente recebe, e `EXECUTION_ALREADY_RATED` é mais acionável ("alguém avaliou")
do que `RATING_WINDOW_CLOSED`.

### D3 — Gamificação dentro do escopo da API

**Decisão.** Pontos e ranking são contrato da v1, não fase 2 do produto.

**Motivo.** A regra "outro membro avalia" (já presente no baseline) só produz consequência se
houver placar. E agregar depois exigiria remodelar execução e avaliação.

---

## G. Testes

### D24 — Testes de integração com MongoDB real

**Decisão.** Cada arquivo sobe um MongoDB em memória. Nada de mock do Mongoose.

**Descartado.** Mockar a camada de dados: a maior parte das regras deste domínio **é** consulta
(índice único, agregação, filtro por janela). Mock não pega justamente o que mais quebra.

**Consequência.** A suíte leva ~2 minutos e depende do binário do `mongod` (baixado na primeira
execução, ~120MB, cacheado no CI). Em troca, os testes pegam índice faltando, agregação errada e
regra de isolamento entre casas.

### D25 — Números exatos, não aproximados

**Decisão.** Os testes de desempenho conferem valores exatos contra uma fixture conhecida
(`tests/stats.test.js`).

**Descartado.** `toBeCloseTo`: esconderia erro de arredondamento e de fuso, que é exatamente onde
esse tipo de cálculo erra. A fixture usa conclusões escolhidas para produzir atrasos de conta exata.

### D23 — Seed para humanos, fixtures para testes

**Decisão.** `npm run seed` monta um estado de demonstração; os testes têm fixtures próprias.

**Descartado.** Reaproveitar o seed nos testes (o plano original): mexer no seed para melhorar a
demonstração quebraria testes sem relação com a mudança.

---

## H. Estrutura e operação

### D22 — Um repositório só (monorepo)

**Contexto.** `houseworks-app/frontend/` era um submódulo **nunca inicializado** (pasta vazia), e
existia um clone completo do mesmo repositório ao lado. O compose construía contra o vazio.

**Primeira decisão.** Remover o submódulo e manter dois repositórios **irmãos**. Resolveu a
ambiguidade imediata, mas trocou por um acoplamento de caminho relativo que só valia na máquina de
quem tinha os dois clones lado a lado: `docker-compose.prod.yml` apontava para
`../houseworks-frontend`, e `frontend/scripts/generate-api-types.mjs` lia o contrato em
`../houseworks-app/docs/openapi.yaml`.

**Decisão (revisada).** Reunir tudo em um **monorepo**: `backend/` e `frontend/` no mesmo
repositório. Dois argumentos forçaram a revisão. O primeiro é operacional: o Komodo clona o
repositório de cada stack num diretório próprio (`bin/periphery/src/stack/mod.rs`), onde o
repositório irmão não existe — o build do front falharia no deploy. O segundo é de fundo, e vem do
próprio API-first: o contrato e o cliente gerado a partir dele não deveriam ser versionados em
separado, porque nada impede um `openapi.yaml` novo de conviver com um `schema.d.ts` velho.

**Consequência.** Um clone basta e um push dispara um deploy. O histórico do frontend foi preservado
com `git subtree`, não esmagado; o repositório `houseworks-frontend` fica arquivado no GitHub. Para
trabalhar só na API, `docker compose up -d mongodb backend`.

### D26 — Sem camada de repositório e sem injeção de dependência

**Decisão.** Serviços falam com o Mongoose direto; módulos são importados.

**Descartado.** Repositórios e contêiner de DI: a indireção não se paga nesta escala, e o custo real
(authoring, navegação, cerimônia em cada teste) seria maior que o benefício. Se um dia houver mais
de um armazenamento, a fronteira natural já existe — os `services/`.

### D31 — Imagem multi-stage com usuário sem privilégio

**Contexto.** Havia um estágio único que instalava tudo com `npm install` e rodava `nodemon` — a
imagem de produção carregava jest, supertest e um binário de ~120MB do `mongodb-memory-server`.

**Decisão.** Dois alvos: `development` (com nodemon, usado pelo compose) e `production`
(`npm ci --omit=dev`, usuário `node`).

**Consequência.** A verificação encontrou um bug de implantação nisso: o `COPY` herdava a permissão
dos arquivos do host e 70 arquivos estavam em `600`, então o processo subia e morria com `EACCES`
ao carregar um módulo. Corrigido com `chmod 644` no repositório **e** `COPY --chown=node:node` na
imagem — para não depender de quem constrói.

### D27 — `toObject` e `toJSON` configurados juntos

**Contexto.** Um documento populado voltava com `_id` mesmo com `toJSON` configurado.

**Motivo.** O Mongoose serializa documentos populados usando o **`toObject` do schema filho**, não
o `toJSON` do pai.

**Decisão.** Todo modelo configura os dois com `createJsonOptions()`
(`config/serialization.js`), que expõe `id` e remove `_id`/`__v`.
