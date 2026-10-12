# Hospedagem

Como colocar o HouseWorks no ar. O caminho recomendado é **uma VPS com Docker Compose** — os
arquivos já estão no repositório e foram testados subindo a stack inteira.

> Guia irmão: [OPERATIONS.md](./OPERATIONS.md) cobre rodar e operar localmente.

---

## 1. A regra que decide tudo: um domínio só

Antes de escolher onde hospedar, entenda esta restrição, porque ela elimina metade das
arquiteturas antes de você perder tempo com elas.

A sessão é um **cookie HttpOnly com Secure e SameSite=Lax**. Em português direto: **o navegador
só envia o cookie se a interface e a API estiverem no mesmo site**.

| Arranjo | Funciona? |
|---|---|
| `https://casa.seudominio.com` com a interface e a API em `/api/v1` | ✅ mesmo site |
| `https://app.seudominio.com` + `https://api.seudominio.com` | ✅ subdomínios do mesmo domínio são o mesmo site |
| `https://meu-app.vercel.app` + `https://minha-api.onrender.com` | ❌ domínios registráveis diferentes |

O terceiro caso é cruel: o navegador descarta o cookie do login, a API responde **200** e a tela
seguinte trata você como anônimo. Não há erro em lugar nenhum para investigar.

Este guia usa o primeiro arranjo — um domínio, API sob `/api` — porque além de resolver o
cookie ele tem um bônus: **não existe CORS**, já que tudo é a mesma origem.

---

## 2. Os três pedaços

O front tem **duas** rotas até a API, e isso não é redundância:

| Quem chama | Endereço | Por quê |
|---|---|---|
| O **navegador** | `https://SEU-DOMINIO/api/v1` | passa pelo proxy, mesmo domínio, sem CORS |
| O **servidor** do Next (SSR) | `http://backend:3000` | dentro da rede do Docker, pelo nome do serviço |

O Caddy fica na frente dos dois: TLS automático, `/api/*` para a API e todo o resto para o Next.

---

## 3. Passo a passo (VPS com Docker)

Pré-requisitos: uma VPS com Docker e Docker Compose, um domínio com registro **A** apontando
para o IP dela, e as portas **80 e 443** livres.

```bash
# 1. Um clone só: o frontend vive em frontend/, dentro deste repositório.
git clone https://github.com/rodrigotxt/houseworks-app.git

# 2. Configuração
cd houseworks-app
cp .env.prod.example .env.prod
```

Edite o `.env.prod`:

| Variável | O que é |
|---|---|
| `DOMAIN` | o domínio real, **sem** `https://` |
| `ACME_EMAIL` | para o Let's Encrypt avisar antes do certificado expirar |
| `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB_NAME` | credenciais do banco — **gere uma senha nova** |
| `JWT_SECRET_KEY` | **gere um segredo novo**; nunca reaproveite o de desenvolvimento |
| `JWT_EXPIRES_IN` | validade do token em segundos (padrão 3600) |

Gere os segredos e cole no arquivo:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"   # senha do Mongo
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"         # JWT_SECRET_KEY
```

```bash
# 3. Subir
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Conferir
curl https://SEU-DOMINIO/api/v1/health
```

O primeiro build demora alguns minutos (o Next compila). **Resolva o DNS antes de subir:** o
Caddy só emite o certificado depois que o domínio aponta para a VPS; se subir antes, ele fica
tentando.

---

## 4. O primeiro usuário

A primeira conta pode ser criada pela tela de cadastro (`/register`), mas ela **nasce sem
casa** — e alguém precisa criar a casa. Por isso, para a primeira conta do servidor, o
caminho mais curto continua sendo a API, criando usuário e casa na mesma chamada:

```bash
curl -X POST https://SEU-DOMINIO/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Seu Nome",
    "username": "seu-usuario",
    "email": "voce@seudominio.com",
    "password": "uma-senha-boa-aqui",
    "householdName": "Casa dos Martins"
  }'
```

Isso cria **o usuário e a casa na mesma chamada**, e você entra como `owner`. A senha precisa
ter **8 caracteres ou mais** — o contrato recusa menos.

**Para as demais pessoas, tudo acontece pela interface**, e há dois caminhos:

| Quem | Como |
|---|---|
| Já vai se virar sozinho | a pessoa cria a conta em `/register` e entra em **Casa** com o **código de convite** |
| Criança, ou quem não vai fazer isso sozinho | quem é `owner` cadastra em **Casa → Cadastrar pessoa**, escolhendo a senha provisória |

O código de convite aparece em *Casa* (rota `GET /households/{id}/invite`, visível para
`owner` e `adult`). No segundo caminho, avise a pessoa para trocar a senha em
**Trocar senha** (menu da conta): enquanto ela não trocar, você conhece a senha dela — e a
troca derruba as outras sessões abertas.
---

## 5. Operação no dia a dia

```bash
# Um atalho para não repetir as flags:
dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }

dc ps                 # estado dos serviços
dc logs -f backend    # acompanhar a API
dc restart backend
dc down               # derrubar (os dados ficam)
dc up -d              # subir de novo
```

Atualizar depois de um push:

```bash
git pull && dc up -d --build
```

**Backup do banco** — é o único dado que não se recria:

```bash
dc exec -T mongodb mongodump --archive --gzip \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  > backup-data-de-hoje.archive.gz
```

A restauração usa `mongorestore --archive --gzip --drop`. Vale agendar num cron e guardar o
arquivo **fora da VPS** — backup no mesmo disco não protege contra a perda do disco.

---

## 6. O que vai te morder se você não souber

| Sintoma | Causa |
|---|---|
| Login responde 200 mas a tela seguinte acha que você é anônimo | Front e API em domínios diferentes — ver § 1 |
| Toda chamada do navegador falha por CORS | `ALLOWED_ORIGINS` não bate com o domínio real |
| A interface continua apontando para localhost:3001 | `NEXT_PUBLIC_API_BASE_URL` é embutido em **tempo de build**; mudar exige `--build` |
| Backend não conecta no banco | A senha do Mongo só é aplicada na **primeira** inicialização do volume; trocar depois exige `down -v`, que **apaga os dados** |
| Erro de certificado no Caddy | O DNS ainda não aponta para a VPS, ou a porta 80 está ocupada por outro proxy |
| `/api/v1/` responde 404 em tudo | No `Caddyfile` a diretiva precisa ser `handle` e não `handle_path` — o prefixo `/api` é preservado de propósito |
| Sessão cai sozinha a cada hora | Esperado: o token dura 1h e o front renova ao receber `TOKEN_EXPIRED` |

---

## 7. Com um painel: Komodo

Se você já administra a VPS com o [Komodo](https://komo.do), quase tudo do § 5 vira botão. O
`Caddyfile` e o `docker-compose.prod.yml` continuam valendo — o Komodo só passa a ser quem os
executa.

**Stack** — um recurso só, apontando para este repositório:

| Campo | Valor | Por quê |
|---|---|---|
| `server` | a sua VPS | onde os containers rodam |
| `repo` / `branch` | `rodrigotxt/houseworks-app` / `main` | o Komodo clona e dá `git pull` |
| `file_paths` | `docker-compose.prod.yml` — ou `docker-compose.proxy.yml` se as portas 80/443 já forem de outro proxy (§ 8) | o padrão do Komodo é `compose.yaml`, que não existe aqui |
| `run_build` | `true` | o compose usa `build:`; sem isto o deploy não reconstrói as imagens |
| `environment` | o conteúdo do `.env.prod` | ele escreve o arquivo e passa por `--env-file` |
| `webhook_enabled` | `true` | um push em `main` dispara o redeploy |

`clone_path` e `run_directory` ficam **vazios** de propósito: o padrão já é o diretório do
repositório clonado, e é lá que o `Caddyfile` está para ser montado pelo compose.

### Os segredos saem do arquivo

Em vez de manter `MONGO_PASSWORD` e `JWT_SECRET_KEY` em texto no `.env.prod` da VPS, crie-os em
*Settings → Variables* marcando **secret**, e interpole no campo `environment` com colchetes duplos:

    MONGO_PASSWORD = [[MONGO_PASSWORD]]
    JWT_SECRET_KEY = [[JWT_SECRET_KEY]]

O valor não aparece em log nem em update, e não é legível por usuário não-admin. O `.env.prod`
deixa de ser a cópia mais valiosa do servidor.

### Por que o monorepo importa aqui

O Komodo clona o repositório de cada Stack num diretório próprio (`<stack_dir>/<nome-da-stack>/`).
Enquanto o front vivia em outro repositório, o compose o alcançava por `../houseworks-frontend` —
caminho que simplesmente não existe ali, e o build falharia no deploy. Foi o que motivou reunir os
dois; ver **D22** em [DECISIONS.md](./DECISIONS.md).

> **Portas 80 e 443.** O Caddy precisa das duas para emitir e renovar o certificado. Se o Komodo
> Core estiver publicando em uma delas, mova-o antes de subir esta stack.

---

## 8. Quando as portas 80 e 443 já são de outro proxy

Este é o caso comum numa VPS que já hospeda outras coisas: um Nginx Proxy Manager (ou Traefik) já
ocupa 80 e 443, e o Caddy do § 3 não chega nem a subir — o `up` falha com `address already in use`.

O `docker-compose.proxy.yml` resolve isso sem abrir mão do roteamento versionado. A ideia: o proxy
que já existe continua terminando o TLS, e o Caddy desta stack vira um roteador interno, sem
publicar porta nenhuma.

```bash
docker compose -f docker-compose.proxy.yml --env-file .env.prod up -d --build
```

O que muda em relação ao § 3:

| | § 3 | § 8 |
|---|---|---|
| Quem publica 80/443 | o Caddy desta stack | o proxy que já existe |
| Quem fala com o Let's Encrypt | o Caddy | o proxy que já existe |
| Caddyfile | `Caddyfile` | `Caddyfile.proxy` (`auto_https off`) |

O Caddy entra na rede do proxy (por padrão `proxy-network`, ajustável por `PROXY_NETWORK`) com o
apelido fixo **`houseworks-proxy`**. O apelido tem motivo prático: o Komodo roda
`docker compose -p <nome-da-stack>`, então o nome real do container depende do nome que você deu à
Stack. Com o apelido, a configuração no proxy da frente é sempre a mesma.

No Nginx Proxy Manager, crie um **Proxy Host**:

| Campo | Valor |
|---|---|
| Domain Names | `tasks.seudominio.com` |
| Scheme | `http` |
| Forward Hostname | `houseworks-proxy` |
| Forward Port | `80` |
| Websockets Support | ligado |
| SSL | pedir certificado novo + Force SSL |

**Por que manter o Caddy, em vez de apontar o proxy direto para cada serviço.** Porque as duas
rotas (`/api/*` para a API, o resto para o Next) ficam no `Caddyfile.proxy`, versionadas no git e
testadas, em vez de morarem no banco do NPM. É a mesma razão de o contrato viver no repositório.

> **O DNS continua obrigatório.** O registro `A` do domínio precisa apontar para a VPS antes de
> pedir o certificado, senão o desafio do Let's Encrypt falha.

---

## 9. Alternativa: serviços gerenciados

Se preferir não administrar servidor, dá para montar com peças gerenciadas — **desde que o
domínio continue sendo um só** (§ 1):

| Peça | Serviço sugerido |
|---|---|
| Interface | Vercel (ambiente natural de um app Next.js) |
| API | Render, Railway ou Fly.io — roda o `backend/Dockerfile`, alvo `production` |
| Banco | MongoDB Atlas (o nível gratuito basta para uma família) |
| Domínio | `app.seudominio.com` para a interface e `api.seudominio.com` para a API |

Duas coisas mudam nesse caminho:

1. O front passa a chamar a URL pública da API em vez de `/api` no mesmo host. Embuta esse
   valor em `NEXT_PUBLIC_API_BASE_URL` **no build**.
2. `API_INTERNAL_URL` passa a ser a mesma URL pública — não existe "rede interna" entre Vercel
   e Render, então a chamada do servidor do Next sai para a internet e volta.

O custo é menos previsibilidade: nos planos gratuitos os serviços hibernam, e a primeira
requisição depois disso demora alguns segundos.

---

## 10. Custo realista

| Caminho | Custo mensal | Manutenção |
|---|---|---|
| VPS pequena (1 vCPU, 1 GB) com Docker | ~US$ 5–10 | atualizar o sistema, acompanhar disco e backup |
| Vercel + Render + Atlas (planos gratuitos) | US$ 0 | nenhuma, com hibernação e limites |
| Os mesmos em planos pagos | ~US$ 20–30 | nenhuma |

Para uma família, a VPS de US$ 5 roda isto com folga: o app é pequeno e o consumo maior é o
build do Next, não o tráfego.

Se a VPS já existe e já roda Komodo (§ 7), o custo marginal é zero — e foi de propósito: o
desenho evita serviços gerenciados justamente para não somar assinaturas a algo que roda numa
máquina que você já paga.

---

## 11. O que está pronto e o que não está

**Pronto e verificado em produção:** TLS automático, cookie seguro, sessão revogável, limite de
tentativas no login, cabeçalhos de segurança, banco sem porta pública, healthcheck do Mongo.
Não há migração de schema para rodar — o Mongoose cria os índices na primeira conexão.

**Não existe ainda** (e vale saber antes de prometer prazo):

- Tela de cadastro — o primeiro usuário é criado por requisição à API (§ 4)
- Recuperação de senha
- Backup automático — o comando está no § 5, mas agendar é com você
- Monitoramento e alerta de erro
- Migração de esquema: mudanças de modelo que exijam preenchimento retroativo precisarão de
  script próprio
