# Operação

Como rodar, configurar, testar e implantar. Para entender o código, veja
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Pré-requisitos

| Ferramenta | Para quê |
|---|---|
| Node.js **22** | rodar a API e os testes |
| Docker + Compose | subir Mongo e a stack completa (opcional — dá para usar um Mongo local) |
| `npx @redocly/cli` | lint do contrato (baixado sob demanda) |

---

## 2. Rodando

> **Há um Makefile na raiz.** `make` sozinho lista tudo, e ele cobre a maior parte desta seção:
> `make up` (banco, API e interface), `make up-api`, `make down`, `make restart`, `make rebuild`,
> `make logs`, `make ps`, `make sh`, `make seed`, `make test`, `make lint`, `make gen-api`,
> `make gen-icons`, `make tv-build` e `make tv-install`.
>
> Ele é conveniência, não requisito: cada alvo vira um comando que está escrito aqui embaixo.
> `make up` também **cria o `.env` a partir do molde** se ele não existir — sem isso a stack
> sobe com variáveis vazias e o erro aparece longe da causa.

### Opção A — tudo em container

```bash
cp .env.example .env        # e preencha; gere um JWT_SECRET próprio
docker compose up -d mongodb backend
docker compose exec backend npm run seed
```

A API fica em **http://localhost:3001** (a porta 3000 interna é publicada na 3001 para não
disputar com o front).

`docker compose up` sem argumentos sobe também o `frontend`, que vive em `frontend/` neste
mesmo repositório. Um clone basta.

### Opção B — local, com Mongo no container

```bash
docker compose up -d mongodb

cd backend
cp .env.example .env        # ajuste MONGO_URI para localhost
npm install
npm run seed
npm run dev                 # nodemon + inspector na 9229
```

### Sem Docker

Qualquer MongoDB acessível serve. Ajuste `MONGO_URI` e pronto.

> Os testes **não** usam esse banco: cada arquivo sobe o próprio MongoDB em memória.

---

## 3. Variáveis de ambiente

Lidas em `config/index.js`. **`JWT_SECRET` ausente faz o processo não subir** — de propósito: a
alternativa era descobrir no primeiro login, com `secretOrPrivateKey must have a value`.

| Variável | Padrão | Para que |
|---|---|---|
| `MONGO_URI` | — | string de conexão |
| `JWT_SECRET` | — | **obrigatória**; assina os tokens |
| `PORT` | `3000` | porta HTTP |
| `NODE_ENV` | `development` | em `production`: cookie `secure` e aviso de CORS |
| `JWT_EXPIRES_IN` | `3600` | validade do token **em segundos** |
| `ALLOWED_ORIGINS` | vazio → origens de dev | CORS, separado por vírgula. **Em produção é obrigatória** |
| `RATE_LIMIT_ENABLED` | `true` | desliga o limite (os testes usam `false`) |
| `RATE_LIMIT_MAX` | `10` | tentativas de login/registro por janela, por IP |
| `RATE_LIMIT_WINDOW_MS` | `900000` | janela do limite (15 min) |
| `OCCURRENCES_CRON` | `0 3 * * *` | quando o job diário roda |
| `TZ` | `America/Sao_Paulo` | fuso do **processo** (usado pelo agendador) |

**Só no `docker-compose.yml`:** `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB_NAME` (inicializam o
container do Mongo) e `NEXT_PUBLIC_API_BASE_URL` (endereço da API visto pelo browser).

> **O fuso da casa não vem daqui.** `TZ` afeta apenas quando o cron dispara.
> `Household.timezone` é que define o "dia" do produto, e é por casa.

---

## 4. Seed

```bash
cd backend
npm run seed           # cria a família, a casa, as tarefas e gera a agenda
npm run seed:destroy   # limpa tudo
```

O que ele cria: 1 casa (`Casa dos Martins`), 5 usuários (1 owner, 1 adult, 3 children), 6 tarefas
com recorrências diferentes — incluindo uma com rodízio e uma ocasional —, a agenda materializada
e 2 execuções (uma já avaliada, outra aguardando). Ele **imprime o código de convite** e a senha de
todos os usuários.

O seed é para **demonstração e desenvolvimento**. Os testes têm fixtures próprias — ver
[DECISIONS.md § D23](./DECISIONS.md).

### Volume para medir desempenho

```bash
node scripts/seed-volume.js 50000    # 50k ocorrências + execuções
```

Gera dados em volume para exercitar as agregações. O aceite de desempenho é
`p95 < 300ms` em `/stats` numa janela realista (ver [ROADMAP.md](./ROADMAP.md)).

---

## 5. Testes

```bash
cd backend
npm test                        # suíte completa (~2 min)
npm run test:watch              # durante o desenvolvimento
npx jest tests/stats.test.js    # uma suíte
```

Como funciona e quais as convenções: [ARCHITECTURE.md § 7](./ARCHITECTURE.md).

**Primeira execução é mais lenta:** o `mongodb-memory-server` baixa o binário do `mongod`
(~120MB) e o guarda em `~/.cache/mongodb-binaries`. O CI faz cache desse diretório.

O limite de tentativas vem **desligado** por padrão nos testes. O arquivo que testa o próprio
limite o religa antes de importar o app.

---

## 6. Contrato

```bash
npx @redocly/cli lint docs/openapi.yaml          # precisa sair "valid, 0 warnings"
npx @redocly/cli preview-docs docs/openapi.yaml  # documentação navegável
```

A configuração do lint está em `redocly.yaml`, com duas exceções conscientes: servidor
`localhost` (é o alvo do compose) e `/health` sem resposta 4XX (por definição).

**Mexeu no contrato?** Mexa na implementação no mesmo commit e rode o lint. Se mudou semântica (não
só forma), registre em [DECISIONS.md](./DECISIONS.md).

---

## 7. Imagens Docker

O `backend/Dockerfile` tem **dois alvos**:

```bash
docker build --target development -t houseworks-api:dev backend   # o que o compose usa
docker build --target production  -t houseworks-api     backend   # produção
```

`production` instala com `npm ci --omit=dev` (sem jest, supertest nem `mongodb-memory-server`) e
roda como usuário `node`.

> **Permissão de arquivo importa.** Se um arquivo do repositório estiver em modo `600`, o processo
> na imagem não consegue lê-lo e morre com `EACCES` ao carregar um módulo. O `COPY --chown=node:node`
> protege contra isso, mas manter os arquivos legíveis (`644`) é o certo de qualquer forma.

O `frontend/Dockerfile` segue o mesmo Runtime (node:22-alpine) e usa `npm ci`.

---

## 8. Job agendado

`jobs/scheduler.js` registra um `node-cron` que roda `dailyJob`:

1. materializa as ocorrências até `hoje + horizonDays` de cada casa;
2. marca como `overdue` o que passou do prazo (com a tolerância da casa);
3. auto-aprova execuções cuja janela de avaliação fechou.

**O job é otimização, não requisito de correção.** Toda leitura de agenda faz o mesmo trabalho
antes de responder — um servidor que ficou parado se reconstrói na primeira leitura. Isso significa
que você pode desligá-lo (`OCCURRENCES_CRON` inválido só emite um aviso) sem quebrar nada.

Quando houver mais de uma réplica, o job deve sair para um worker separado. Rodar em N réplicas
continua **correto** (o índice único garante), apenas redundante.

---

## 9. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `JWT_SECRET nao definido` na subida | Falta a variável. Copie `.env.example` para `.env` |
| Backend não conecta após trocar `MONGO_PASSWORD` | O Mongo só aplica a senha de root na **primeira** inicialização. Recrie o volume: `docker compose down -v` |
| `docker compose up` falha no serviço `frontend` | Build do front quebrado — veja `docker compose logs frontend`. Para trabalhar só na API: `docker compose up -d mongodb backend` |
| `EACCES` ao carregar módulo na imagem | Arquivo com permissão restritiva. `chmod 644` — ver §7 |
| Testes travando na primeira execução | Está baixando o binário do `mongod` (~120MB) |
| `429 RATE_LIMITED` durante desenvolvimento | Limite de tentativas. Ajuste `RATE_LIMIT_MAX` ou `RATE_LIMIT_ENABLED=false` |
| Front recebendo erro de CORS | `ALLOWED_ORIGINS` precisa conter a origem do front |
| Agenda de uma casa vazia | Nenhuma tarefa `active`, ou `horizonDays` muito baixo |

---

## 10. Integração contínua

`.github/workflows/ci.yml` roda em push para `main` e em pull request:

1. **lint do contrato** (`redocly lint`);
2. **suíte de testes** (com cache do binário do `mongod`);
3. **build da imagem de produção** — é o passo que pega um Dockerfile que produz algo que não sobe.

---

## 11. Antes de abrir um PR

- [ ] `npm test` verde
- [ ] `npx @redocly/cli lint docs/openapi.yaml` sem warning
- [ ] Contrato, implementação e teste no mesmo commit
- [ ] Caso negado coberto (sem token, papel errado, outra casa) quando a rota exige autorização
- [ ] Decisão nova registrada em [DECISIONS.md](./DECISIONS.md)
- [ ] Nenhum segredo no diff

---

## 12. Backup e restauração

O banco é o único dado insubstituível do projeto — pontos, execuções, avaliações, quem fez o
quê. Ele vive num volume Docker numa única VPS. Por isso tem cópia **e** ensaio de restauração.

### Instalar (numa máquina nova, ou para atualizar os scripts)

```bash
sudo ./scripts/install-backup.sh
```

Ficam instalados:

| Caminho | O que é |
|---|---|
| `/opt/houseworks-backup/backup.sh` | o dump |
| `/opt/houseworks-backup/restore.sh` | o ensaio de restauração |
| `/etc/default/houseworks-backup` | configuração (destino remoto, monitor, retenção) |
| `/etc/cron.d/houseworks-backup` | backup diário às 03:30; ensaio aos domingos às 05:00 |

Os scripts são **copiados**, não apontados para o clone do Komodo. Aquele caminho pertence ao
Komodo e acompanha a branch configurada; um cron apontando para lá quebra em silêncio no dia em
que ele mudar — e cron quebrado não avisa ninguém.

### O que o backup faz, e por que nessa ordem

1. dump comprimido num arquivo **temporário**;
2. confere que é um gzip íntegro (`gzip -t`) e que não está vazio;
3. só então renomeia para o nome final — **um backup pela metade nunca "existe"**;
4. apaga o que passou de `KEEP_DAYS` (padrão 14);
5. copia para fora, se `RCLONE_REMOTE` estiver configurado;
6. avisa o monitor externo. Se qualquer passo falhar, avisa que **falhou**.

As credenciais vêm de `/etc/komodo/stacks/houseworks/.env`, que o Komodo reescreve a cada
deploy, e vão para o container por variável de ambiente — não por argumento de linha de comando,
que apareceria em `ps` e no histórico do shell.

### Ligar a cópia fora da máquina

Só local não resolve perder o servidor. Com um bucket no Cloudflare R2:

```bash
sudo apt-get install -y rclone        # ou o binário oficial
sudo rclone config                    # crie o remote r2, tipo "s3", provider "Cloudflare"
```

Depois, em `/etc/default/houseworks-backup`:

```
RCLONE_REMOTE=r2:houseworks-backups
```

O script usa `rclone copy`, nunca `sync`: numa cópia de segurança, apagar no destino é a última
coisa que se quer. Como `copy` nunca remove, a limpeza do bucket é **explícita e separada**:
`KEEP_REMOTE_DAYS` (padrão 60) apaga do destino, e só do destino, o que passou daquele prazo —
e apenas arquivos que casem com `houseworks-*.archive.gz`.

Por que 60 dias no bucket e 14 na VPS: o disco da VPS é caro e pequeno, o bucket é barato. O
local existe para restaurar rápido; o remoto, para o dia em que a máquina não existir mais.

### Ligar o aviso de falha

Um backup que falha em silêncio é pior que não ter. Crie um check em
[healthchecks.io](https://healthchecks.io) com frequência diária e período de tolerância de
algumas horas, e cole a URL de ping (sem barra final):

```
HEALTHCHECK_URL=https://hc-ping.com/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

O script faz um ping quando termina bem e `/fail` quando algo dá errado. Se parar de pingar, o
serviço avisa.

### O ensaio de restauração

```bash
sudo /opt/houseworks-backup/restore.sh              # a cópia local mais recente
sudo /opt/houseworks-backup/restore.sh arquivo.gz   # uma cópia específica
sudo /opt/houseworks-backup/restore.sh --remoto     # baixa a mais recente do R2
```

O cron semanal usa `--remoto`. A diferença importa: ensaiar a cópia **local** prova só que o
dump foi bem escrito; ensaiar a que vem do bucket prova também que ela **chegou lá e volta**.

Ele sobe um container **novo**, com volume próprio, restaura ali e confere:

- as coleções centrais existem (`users`, `households`, `memberships`, `tasks`, `taskoccurrences`);
- nenhuma das centrais está vazia;
- os índices voltaram — inclusive o **único** de `memberships`, sem o qual a casa passa a aceitar
  o mesmo usuário duas vezes (e o estrago só aparece meses depois);
- uma consulta de verdade devolve a casa pelo nome.

Sai com código ≠ 0 se qualquer verificação falhar, e destrói o container no fim. **A produção não é
tocada nem para leitura.**

### Restaurar de verdade (quando precisar)

O ensaio é descartável; isto é o procedimento real, com a aplicação parada:

```bash
docker compose -f docker-compose.proxy.yml stop backend frontend
docker exec -i houseworks-mongodb-1 mongorestore --archive --gzip --drop \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  < /var/backups/houseworks/houseworks-AAAA-MM-DD_HHMMSS.archive.gz
docker compose -f docker-compose.proxy.yml start backend frontend
```

`--drop` apaga cada coleção antes de recriar. Sem ele, o restore **soma** ao que já existe e
duplica tudo. É o erro clássico de restauração.

**Se o banco de destino tiver outro nome**, o dump não adivinha: é preciso remapear, senão os
dados vão para uma database nova e a aplicação continua vendo a antiga, vazia.

```bash
docker exec -i mongodb mongorestore --archive --gzip --drop \
  --nsFrom='houseworks.*' --nsTo='db_houseworks.*' \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  < copia.archive.gz
```

Em produção os dois nomes coincidem (`houseworks`), então o comando sem remapeamento está
certo — foi assim que este parágrafo foi escrito e conferido.

**Ensaio executado de verdade, em 2026-10-17.** A cópia de produção foi restaurada por cima do
banco de desenvolvimento, com o procedimento acima e cronometrada:

| Etapa | Tempo |
|---|---|
| parar backend e frontend | 1,4 s |
| `mongorestore` (113 documentos) | 2,0 s |
| subir de novo | 1,5 s |
| **total de indisponibilidade** | **4,8 s** |

Os índices voltaram sozinhos (`user_1_household_1` entre eles), a API respondeu `200` e o
login recusou credencial inválida com `401` em vez de quebrar. O banco de desenvolvimento foi
recriado com `make seed` depois. O tamanho cresce com o uso, mas a ordem de grandeza é esta: a
janela de manutenção é de segundos, não de minutos.

### Conferir

```bash
sudo tail -5 /var/log/houseworks-backup.log
sudo tail -20 /var/log/houseworks-restore.log
sudo ls -la /var/backups/houseworks/
```
