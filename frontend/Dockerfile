# syntax=docker/dockerfile:1
#
# Dois alvos, com propósitos diferentes:
#
#   production   — build otimizado e servidor de produção. É o que o docker compose usa:
#                  navegação rápida e nada escrito no seu repositório.
#   development  — next dev com hot reload, para QUEM ESTÁ MEXENDO NO CÓDIGO. Roda no
#                  host (npm run dev), onde o reload é imediato e os arquivos são seus.
#
# O alvo de desenvolvimento existir aqui não significa que o compose deva usá-lo: rodar
# o servidor de desenvolvimento dentro de um container amarrado ao seu diretório é mais
# lento em cada navegação e deixa arquivos de root no repositório.

FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# --------------------------------------------------------------------- produção
FROM base AS production

# NEXT_PUBLIC_* é embutido no bundle em tempo de BUILD: a variável precisa existir aqui,
# não só na hora de rodar.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]

# ---------------------------------------------------------------- desenvolvimento
FROM base AS development
RUN npm ci
COPY . .
ENV NODE_ENV=development
EXPOSE 3000 9230
CMD ["npm", "run", "dev", "--", "--turbopack"]
