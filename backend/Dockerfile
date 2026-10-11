# syntax=docker/dockerfile:1
#
# Dois alvos, porque desenvolvimento e producao precisam de coisas diferentes:
#
#   development  — tudo instalado, nodemon e inspector. E o alvo do docker compose.
#   production   — so dependencias de runtime, sem ferramentas de teste, como usuario
#                  sem privilegio.
#
# Antes havia um unico estagio que instalava tudo com "npm install" e rodava nodemon —
# ou seja, a imagem de producao carregava jest, supertest e mongodb-memory-server
# (que baixa um binario de ~120MB) sem precisar de nada disso.

FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---------------------------------------------------------------- desenvolvimento
FROM base AS development
ENV NODE_ENV=development
# --omit=dev TAMBEM aqui, de propósito: o container roda o servidor, não os testes.
# Instalar as ferramentas de teste custaria ~120MB de download (o MongoDB em memória
# baixa um binário próprio) a cada build, para nada. Os testes rodam no host —
# "cd backend && npm test" — e é assim que o CI também faz.
RUN npm ci --omit=dev && npm install --no-save nodemon
COPY . .
EXPOSE 3000 9229
CMD ["./node_modules/.bin/nodemon", "--inspect=0.0.0.0:9229", "server.js"]

# --------------------------------------------------------------------- producao
FROM base AS production
ENV NODE_ENV=production
# --omit=dev deixa de fora jest, supertest e mongodb-memory-server.
RUN npm ci --omit=dev && npm cache clean --force
# --chown de proposito: sem ele a imagem herda a permissao dos arquivos do host, e um
# arquivo 600 (como os criados por alguns editores) deixa o app sem conseguir ler o
# proprio codigo — o processo sobe e morre com EACCES ao carregar um modulo.
COPY --chown=node:node . .
# O usuario "node" ja existe na imagem oficial; o processo nao precisa de root.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
