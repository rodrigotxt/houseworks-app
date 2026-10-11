# Atalhos do dia a dia. Requer Docker Compose v2 (o comando antigo, docker-compose,
# nao existe mais nas instalacoes atuais).
#
# Este Makefile e conveniencia, nao requisito: todos os alvos viram um comando que
# esta documentado em docs/OPERATIONS.md.

COMPOSE := docker compose
BACKEND := backend

.DEFAULT_GOAL := help

.PHONY: help up down logs ps sh seed seed-destroy test test-watch lint install

help: ## Lista os alvos disponiveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Sobe so o banco e a API (sem o frontend)
	$(COMPOSE) up -d mongodb backend

down: ## Derruba a stack
	$(COMPOSE) down

logs: ## Acompanha os logs da API
	$(COMPOSE) logs -f backend

ps: ## Mostra o estado dos servicos
	$(COMPOSE) ps

sh: ## Shell dentro do container da API
	$(COMPOSE) exec backend sh

seed: ## Popula a familia de exemplo (imprime o codigo de convite)
	$(COMPOSE) exec backend npm run seed

seed-destroy: ## Limpa todos os dados
	$(COMPOSE) exec backend npm run seed:destroy

install: ## Instala as dependencias localmente
	cd $(BACKEND) && npm install

test: ## Roda a suite de testes
	cd $(BACKEND) && npm test

test-watch: ## Roda os testes em modo watch
	cd $(BACKEND) && npm run test:watch

lint: ## Valida o contrato OpenAPI
	npx @redocly/cli lint docs/openapi.yaml
