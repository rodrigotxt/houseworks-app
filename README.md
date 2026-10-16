# HouseWorks

Gestão de tarefas domésticas para uma família: a casa divide as tarefas, alguém executa e
**outro membro confere e dá a nota**.

| | |
|---|---|
| [`backend/`](./backend) | Node.js 22 · Express · MongoDB · JWT — a API |
| [`frontend/`](./frontend) | Next.js 15 · React 19 · MUI 7 · PWA instalável — a interface |
| [`tv/`](./tv) | Android (Kotlin, WebView) — o app da TV, para instalar na televisão |
| [`docs/`](./docs) | contrato, domínio, decisões, operação e implantação |

> **Um repositório só.** O contrato em [`docs/openapi.yaml`](./docs/openapi.yaml) é a fonte de
> verdade, e o frontend gera os tipos a partir dele — os dois versionados juntos, para não
divergirem.

---

## Por onde começar

| Você quer… | Leia |
|---|---|
| Entender o que a API faz | [docs/openapi.yaml](./docs/openapi.yaml) (o contrato) |
| Entender as regras de negócio | [docs/DOMAIN.md](./docs/DOMAIN.md) |
| Escrever código aqui | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — mapa, convenções e receituário |
| Saber **por que** algo é assim | [docs/DECISIONS.md](./docs/DECISIONS.md) |
| Rodar, configurar, testar | [docs/OPERATIONS.md](./docs/OPERATIONS.md) |
| Colocar no ar (VPS, domínio, TLS, Komodo) | [docs/DEPLOY.md](./docs/DEPLOY.md) |
| Construir a UI | [docs/FRONTEND.md](./docs/FRONTEND.md) |
| Instalar o app na TV | [tv/README.md](./tv/README.md) |
| Ver o histórico e o que falta | [docs/ROADMAP.md](./docs/ROADMAP.md) |

**Se você é uma IA continuando este projeto:** leia `ARCHITECTURE.md` (onde as coisas moram e como
adicionar), `DOMAIN.md` (as invariantes que não podem ser violadas) e `DECISIONS.md` (para não
reabrir uma decisão já tomada com o custo já conhecido). O contrato em `openapi.yaml` é a fonte de
verdade: **contrato primeiro, implementação depois, no mesmo commit**.

---

## Rodando rápido

```bash
make up      # sobe banco, API e interface (cria o .env a partir do molde se faltar)
make seed    # família de exemplo + agenda gerada; imprime o código de convite
```

| | |
|---|---|
| Interface | **http://localhost:3000** |
| API | **http://localhost:3001** — smoke test: `curl localhost:3001/api/v1/health` |

**`make` sozinho lista tudo.** Os alvos do dia a dia:

| Alvo | O que faz |
|---|---|
| `make up` / `make up-api` | sobe tudo (com rebuild) / só banco e API, que é mais rápido |
| `make down` / `make restart` / `make rebuild` | derruba (dados ficam) / reinicia / reconstrói as imagens |
| `make logs` / `make logs-api` / `make ps` / `make sh` | acompanhar e entrar |
| `make seed` / `make seed-destroy` | popular / limpar os dados de exemplo |
| `make test` / `make test-spatial` / `make lint` | suíte do backend / D-pad do painel / contrato |
| `make gen-api` / `make gen-icons` | regenerar os tipos do contrato / a arte da marca |
| `make tv-build` / `make tv-install` | compilar o APK da TV / instalar na TV por adb |

Nada disso é obrigatório: cada alvo é um comando que também está escrito em
[docs/OPERATIONS.md](./docs/OPERATIONS.md).

Sem Docker, para trabalhar na API com reload imediato:

```bash
cd backend && npm install && npm run dev
```

---

## Testes

```bash
cd backend && npm test            # 187 testes, ~3 min
npx @redocly/cli lint docs/openapi.yaml
```

Cada arquivo de teste sobe o próprio MongoDB em memória — não é preciso banco nem Docker.

---

## Mapa do repositório

```
backend/
  server.js      conecta no banco, escuta, sobe o job agendado
  app.js         monta o Express (é o que os testes usam)
  routes/        declaração de rotas
  middlewares/   autenticação, autorização, validação, erro
  controllers/   HTTP ↔ serviço
  services/      REGRAS DE NEGÓCIO
  models/        schema, índices e invariantes
  schemas/       validação de entrada (zod)
  tests/         suíte completa
frontend/        a interface (mesmo repositório — ver frontend/README.md)
docs/            contrato, domínio, decisões, operação, implantação e guia do front
```

Detalhamento em [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Fluxo de branches

**`develop` é onde o trabalho acontece. `main` é produção.**

```
develop   trabalho do dia a dia -- commit e push aqui, sempre
   |
   +-- merge (so quando solicitado) -->  main  -->  deploy automatico (~100s)
```

Todo commit vai para `develop`, e o push é para `origin/develop`. **Nada vai direto para `main`.**
O merge de `develop` em `main` é um ato deliberado, feito só quando alguém pede.

O motivo é que **um push em `main` é um deploy**: o webhook do Komodo (§ 7 de
[DEPLOY.md](./docs/DEPLOY.md)) reconstrói as imagens e sobe em produção sozinho. Trabalhar em
`develop` é o que permite mexer no código sem que cada commit chegue à casa das pessoas.

O Komodo filtra o webhook pela branch configurada na Stack (`main`). Foi verificado: um push em
`develop` não recria nenhum container.

---

## Estado

Todas as seis fases do [roadmap](./docs/ROADMAP.md) estão concluídas e **as 38 operações do
contrato respondem** — verificado batendo em cada rota declarada. 208 testes verdes, em 14 suítes.

A interface já cobre Tarefas, Agenda e Desempenho, além do painel da TV. O que ainda falta está
listado no fim do [README do frontend](./frontend/README.md).
