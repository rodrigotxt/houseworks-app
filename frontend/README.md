# HouseWorks — frontend

A interface do HouseWorks: as tarefas da casa, a agenda, os lembretes e o placar.

Next.js 15 (App Router) · React 19 · TypeScript · MUI 7 · PWA instalável.

> Um repositório só: a API vive em [`backend/`](../backend) e o contrato que estes tipos seguem
> está em [`docs/openapi.yaml`](../docs/openapi.yaml).

---

## Como este front está organizado

**Um app, vários shells.** Desktop, tablet, celular e TV são o mesmo código; o que muda é
o chrome em volta. Isso é possível porque os quatro alvos não são igualmente difíceis:

| Alvo | O que muda | Onde é resolvido |
|---|---|---|
| Desktop, tablet, celular | Tamanho e navegação | CSS e breakpoints, dentro do shell |
| TV | **Entrada**: não existe ponteiro, é controle remoto | Um shell com alvos maiores e sem barra inferior + navegação espacial por D-pad (`lib/device/spatial.ts`) |
| App nativo de loja | **Runtime** | Fora de escopo — exigiria outro runtime |

```
app/
  (auth)/login/       pública — entrar
  (auth)/register/    pública — criar conta (nasce SEM casa, de propósito)
  (app)/              autenticadas — layout resolve a casa e monta o shell
  (tv)/…              (o painel hoje vive em (app)/panel)
  onboarding/         quem ainda não tem casa: criar a sua ou entrar por código
components/
  shells/             o chrome: navegação lateral, inferior e da TV
  ui/                 primitivos e o tema
lib/
  domain/             TYPESCRIPT PURO — sem React, sem MUI, sem Next
    api/              tipos gerados do contrato + um módulo por área
    rules.ts          permissões espelhadas (para esconder o que não pode)
    dates.ts          dias de calendário sem deslocamento de fuso
  session/            acesso à API no servidor e no browser
  device/             detecção de tipo de aparelho
```

### As três regras que sustentam isso

1. **`lib/domain` é puro.** Sem import de React, MUI ou Next. É o que permite testar as
   regras com node e o que tornaria um cliente nativo uma extração mecânica, não uma
   reescrita.
2. **Diferença de dispositivo mora só nos shells.** Um componente que pergunta "estou no
   celular?" provavelmente está no lugar errado.
3. **Os tipos vêm do contrato, não da mão.** `npm run gen:api` lê `../docs/openapi.yaml` e
   gera `lib/domain/api/schema.d.ts` (versionado). Se a API mudar, o build reclama em vez de
   quebrar em produção.

---

## Rodando

```bash
cp .env.example .env      # aponte para a API e ajuste o que precisar
npm install
npm run dev               # http://localhost:3000
```

A API precisa estar no ar (`cd .. && docker compose up -d mongodb backend`) e semeada
(`docker compose exec backend npm run seed`). O seed imprime e-mail e senha dos exemplos.

**Duas URLs para a mesma API**, e isso não é redundância:

| Variável | Para quem | Valor típico |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | o **browser** | `http://localhost:3001` |
| `API_INTERNAL_URL` | o **servidor** (SSR) | `http://backend:3000` no Docker |

Sem o prefixo `/api/v1` — quem acrescenta a versão é o cliente
(`lib/domain/api/client.ts`). Configurar o sufixo aqui duplicaria.

### Comandos

```bash
npm run dev         # desenvolvimento
npm run build       # build de produção
npm run start       # serve o build
npm run gen:api     # regenera os tipos a partir do contrato
npm run gen:icons   # regenera os ícones do PWA
```

Para gerar os tipos com o contrato em outro caminho:
`API_SPEC=/caminho/openapi.yaml npm run gen:api`

---

## O painel da TV

`/panel` é a tela de 10 pés: tipografia grande, sem barra inferior, feita para ser lida
do sofá e operada pelo controle remoto. Quem chega de uma TV cai direto nela.

**Estado atual:** é um painel de leitura — mostra a agenda de hoje, o progresso e a lista
ordenada com o que falta primeiro. **A navegação por controle remoto funciona**: as setas
percorrem a lista, o item focado ganha um anel grosso e a página rola junto.

### Como o D-pad funciona

`lib/device/spatial.ts` decide para onde o foco vai; `useSpatialNavigation.ts` liga as
setas a essa decisão, e **só na TV** — no computador e no celular as setas têm outro
sentido. Três decisões que valem saber antes de mexer:

1. **A escolha é geométrica, não a ordem do DOM.** Com duas colunas, "o próximo" faria a
   seta para baixo pular de coluna; o que o controle promete é espaço. A função é pura
   (recebe retângulos, devolve um índice), e por isso tem teste: `npm run test:spatial`,
   com o runner embutido do Node e nenhuma dependência nova.
2. **No fim da lista, a seta não é consumida.** Sem alvo naquela direção, o evento segue
   para o navegador e a página rola — em vez de não acontecer nada.
3. **O anel de foco vale para `:focus`, não só `:focus-visible`**, e mora em `globals.css`
   ancorado em `html[data-tv]`. O foco aqui é movido por JavaScript, e a heurística do
   navegador não garante que um `focus()` programático conte como "visível": o usuário
   ficaria sem saber onde está. O atributo vai no `<html>`, escrito pelo layout raiz, para
   o seletor ganhar por especificidade do anel do tema — que chega como classe do Emotion,
   com a mesma especificidade, e venceria pela ordem de injeção.

**O passo seguinte** é permitir concluir e pular tarefas direto do painel; hoje ele só lê.

---

## Lembretes e push

`/reminders` é a tela dos avisos da casa, em duas leituras:

| Seção | O que é |
|---|---|
| **Agora** | notificações que já dispararam e ainda pedem uma ação minha ("Feito", "Adiar") |
| **Lembretes da casa** | a regra de cada lembrete, com o próximo disparo |

"Feito" resolve a notificação **para mim** e não desliga a recorrência; "Adiar" cria um
disparo só para quem pediu. A regra de quem cria o quê (adulto para qualquer um, criança só
para si) vem da API e está espelhada em `lib/domain/rules.ts`.

O canal `in_app` é a caixa de notificações (`GET /me/notifications`). O canal `push` usa
Web Push:

| Peça | Papel |
|---|---|
| `components/reminders/PushToggle.tsx` | liga/desliga o push **neste aparelho** |
| `lib/device/push.ts` | pede permissão, inscreve no `pushManager` e envia a inscrição para a API |
| `public/sw.js` | trata `push` e `notificationclick` (abre ou foca `/reminders`) |

O push depende de VAPID no servidor — `GET /me/push/config` diz se existe. Sem as chaves, a
tela avisa que o push está indisponível e o `in_app` continua. **No iPhone, só funciona com
o app instalado na Tela de Início** (iOS 16.4+); o toggle explica isso em vez de falhar.

O service worker continua **sem cachear resposta de API** — o push é a única coisa nova nele.

---

## PWA

Instalável no celular: manifest, ícones (inclusive maskable) e um service worker que
guarda o *shell* para o app não abrir em branco sem rede.

O service worker **não cacheia resposta de API** — e não precisa: a API está em outra
origem e nem passa por ele. Dado de tarefa velho é pior que dado ausente.

O registro só acontece em produção (`components/pwa/ServiceWorkerRegistrar.tsx`), para o
service worker não atrapalhar o desenvolvimento.

---

## O que ainda não existe

- **Concluir, pular e marcar lembretes pelo painel da TV** — hoje ele é só leitura
- **Alternar entre casas** — a API suporta várias; a UI assume a primeira
- **Configurações da casa** — nome, fuso, janela de avaliação e horizonte. O `PATCH /households/{id}`
  já suporta; a tela de Casa cuida hoje só de membros e convite.
