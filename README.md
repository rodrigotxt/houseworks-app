# HouseWorks

Gestão de tarefas domésticas para uma família: a casa divide as tarefas, alguém executa e
**outro membro confere e dá a nota**.

| | |
|---|---|
| [`backend/`](./backend) | Node.js 22 · Express · MongoDB · JWT — a API |
| [`frontend/`](./frontend) | Next.js 15 · React 19 · MUI 7 · PWA instalável — a interface |
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
| Ver o histórico e o que falta | [docs/ROADMAP.md](./docs/ROADMAP.md) |

**Se você é uma IA continuando este projeto:** leia `ARCHITECTURE.md` (onde as coisas moram e como
adicionar), `DOMAIN.md` (as invariantes que não podem ser violadas) e `DECISIONS.md` (para não
reabrir uma decisão já tomada com o custo já conhecido). O contrato em `openapi.yaml` é a fonte de
verdade: **contrato primeiro, implementação depois, no mesmo commit**.

---

## Rodando rápido

```bash
cp .env.example .env                      # preencha (e gere um JWT_SECRET próprio)
docker compose up -d mongodb backend
docker compose exec backend npm run seed  # família de exemplo + agenda gerada
```

A API responde em **http://localhost:3001**. Smoke test: `curl http://localhost:3001/api/v1/health`.

Sem Docker:

```bash
cd backend && npm install && npm run dev
```

O seed imprime o **código de convite** da casa e a senha dos usuários de exemplo.

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

## Estado

Todas as seis fases do [roadmap](./docs/ROADMAP.md) estão concluídas e **as 36 operações do
contrato respondem** — verificado batendo em cada rota declarada. 187 testes verdes.

A interface já cobre Tarefas, Agenda e Desempenho, além do painel da TV. O que ainda falta está
listado no fim do [README do frontend](./frontend/README.md).
