# Atalhos do dia a dia do HouseWorks.
#
#   make            lista tudo o que da para fazer
#   make up         sobe o projeto inteiro
#
# Requer Docker Compose v2 — o comando antigo, com hifen, nao existe mais nas instalacoes
# atuais. Este Makefile e conveniencia, nao requisito: cada alvo vira um comando que esta
# documentado em docs/OPERATIONS.md.

COMPOSE := docker compose
BACKEND := backend
FRONTEND := frontend
TV := tv

# Onde estao o JDK 17 e o Android SDK, para os alvos de TV. Sobrescreva se os seus estiverem
# noutro lugar:  make tv-build JAVA_HOME=/usr/lib/jvm/java-17-openjdk
JAVA_HOME ?= $(HOME)/.local/jdk17
ANDROID_HOME ?= $(HOME)/.local/android-sdk
ADB := $(ANDROID_HOME)/platform-tools/adb

.DEFAULT_GOAL := help

.PHONY: help up up-api down restart rebuild logs logs-api ps sh seed seed-destroy \
        install test test-watch test-front test-domain test-spatial lint gen-api gen-icons \
        tv-build tv-install tv-devices

help: ## Lista os alvos disponiveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ------------------------------------------------------------ subir e derrubar

# O compose le MONGO_*, JWT_SECRET_KEY e ALLOWED_ORIGINS do .env da raiz. Sem ele a stack sobe
# com variaveis VAZIAS — o Mongo sem credencial e a API sem segredo — e o erro aparece longe da
# causa. Este alvo existe para o primeiro 'make up' num clone novo nao falhar assim.
.env:
	@cp .env.example .env
	@echo "Criei o .env a partir do molde — revise os valores antes de usar de verdade."

up: .env ## Sobe tudo: banco, API e interface
	$(COMPOSE) up -d --build
	@echo ""
	@printf '  Aguardando a API'
	@ok=0; for i in $$(seq 1 40); do \
		if curl -sf http://localhost:3001/api/v1/health >/dev/null 2>&1; then ok=1; break; fi; \
		printf '.'; sleep 2; \
		done; \
		if [ "$$ok" = "1" ]; then echo ' pronta.'; else echo ' ainda nao respondeu — veja: make logs-api'; fi
	@echo ""
	@echo "  Interface   http://localhost:3000"
	@echo "  API         http://localhost:3001/api/v1/health"
	@echo ""
	@echo "  Primeira vez? Rode: make seed"

up-api: .env ## Sobe so o banco e a API (mais rapido para quem trabalha na API)
	$(COMPOSE) up -d mongodb backend

down: ## Derruba a stack (os dados do banco ficam)
	$(COMPOSE) down

restart: ## Reinicia os servicos sem recriar os containers
	$(COMPOSE) restart

rebuild: ## Derruba, reconstroi as imagens e sobe (apos mexer em Dockerfile ou dependencia)
	$(COMPOSE) down
	$(COMPOSE) up -d --build

logs: ## Acompanha os logs de todos os servicos
	$(COMPOSE) logs -f

logs-api: ## Acompanha so os logs da API
	$(COMPOSE) logs -f backend

ps: ## Mostra o estado dos servicos
	$(COMPOSE) ps

sh: ## Abre um shell dentro do container da API
	$(COMPOSE) exec backend sh

# ---------------------------------------------------------------------- dados

seed: ## Popula a familia de exemplo (imprime o codigo de convite)
	$(COMPOSE) exec backend npm run seed

seed-destroy: ## Limpa os dados de exemplo
	$(COMPOSE) exec backend npm run seed:destroy

# ------------------------------------------------------ qualidade e contrato

install: ## Instala as dependencias do backend e do frontend, fora do Docker
	cd $(BACKEND) && npm install
	cd $(FRONTEND) && npm ci

test: ## Roda a suite do backend (MongoDB em memoria, sem Docker)
	cd $(BACKEND) && npm test

test-watch: ## Roda a suite do backend em modo watch
	cd $(BACKEND) && npm run test:watch

test-front: ## Roda os testes de unidade do frontend (dominio + controle remoto)
	cd $(FRONTEND) && npm run test:front

test-domain: ## Roda os testes do dominio do frontend (formatos)
	cd $(FRONTEND) && npm run test:domain

test-spatial: ## Roda os testes da navegacao por controle remoto (frontend)
	cd $(FRONTEND) && npm run test:spatial

lint: ## Valida o contrato OpenAPI
	npx --yes @redocly/cli lint docs/openapi.yaml

gen-api: ## Regenera os tipos do frontend a partir do contrato
	cd $(FRONTEND) && npm run gen:api

gen-icons: ## Regenera a arte da marca (icones do PWA e do app de TV)
	cd $(FRONTEND) && npm run gen:icons

# ------------------------------------------------------------------- app da TV

tv-devices: ## Lista as TVs conectadas por adb
	$(ADB) devices -l

tv-build: ## Compila o APK do app da TV (precisa de JDK 17 e Android SDK)
	cd $(TV) && JAVA_HOME="$(JAVA_HOME)" ANDROID_HOME="$(ANDROID_HOME)" ./gradlew assembleDebug
	@echo ""
	@echo "  APK  $(TV)/app/build/outputs/apk/debug/app-debug.apk"

tv-install: tv-build ## Compila e instala o APK na TV conectada por adb
	$(ADB) install -r $(TV)/app/build/outputs/apk/debug/app-debug.apk
