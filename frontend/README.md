# HouseWorks — frontend

A interface do HouseWorks: as tarefas da casa, a agenda e o placar.

Next.js 15 (App Router) · React 19 · TypeScript · MUI 7 · PWA instalável.

> A API vive em um repositório **irmão**: [`../houseworks-app`](../houseworks-app).

---

## Como este front está organizado

**Um app, vários shells.** Desktop, tablet, celular e TV são o mesmo código; o que muda é
o chrome em volta. Isso é possível porque os quatro alvos não são igualmente difíceis:

| Alvo | O que muda | Onde é resolvido |
|---|---|---|
| Desktop, tablet, celular | Tamanho e navegação | CSS e breakpoints, dentro do shell |
| TV | **Entrada**: não existe ponteiro, é controle remoto | Um shell com alvos maiores e sem barra inferior |
| App nativo de loja | **Runtime** | Fora de escopo — exigiria outro runtime |

```
app/
  (auth)/login/       pública
  (app)/              autenticadas — layout resolve a casa e monta o shell
  (tv)/…              (o painel hoje vive em (app)/panel)
  onboarding/         quem ainda não tem casa
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
3. **Os tipos vêm do contrato, não da mão.** `npm run gen:api` lê o `openapi.yaml` do
   repositório irmão e gera `lib/domain/api/schema.d.ts` (versionado). Se a API mudar, o
   build reclama em vez de quebrar em produção.

---

## Rodando

```bash
cp .env.example .env      # aponte para a API e ajuste o que precisar
npm install
npm run dev               # http://localhost:3000
```

A API precisa estar no ar (`cd ../houseworks-app && docker compose up -d mongodb backend`)
e semeada (`npm run seed` lá). O seed imprime e-mail e senha dos usuários de exemplo.

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

**Estado atual:** é um painel de leitura — mostra a agenda de hoje e o progresso. Navegação
espacial por D-pad ainda **não** está implementada; hoje o foco segue a ordem natural do
navegador. O passo seguinte é um gerenciador de foco para as setas do controle.

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

- Editar e criar tarefas pela interface (a API já suporta; faltam os formulários)
- Concluir, pular e desfazer pela agenda
- A tela de Desempenho (o ranking e as estatísticas já chegam da API)
- Navegação espacial por controle remoto no painel da TV
- Alternar entre casas (a API suporta várias; a UI assume a primeira)
