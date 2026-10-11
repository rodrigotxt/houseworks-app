# backend

A API. O ponto de entrada do repositório é o [README da raiz](../README.md), e a documentação
completa está em [`../docs/`](../docs/):

- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) — mapa do código, convenções e receituário
- [DOMAIN.md](../docs/DOMAIN.md) — entidades, regras e invariantes
- [DECISIONS.md](../docs/DECISIONS.md) — registro de decisões técnicas
- [OPERATIONS.md](../docs/OPERATIONS.md) — rodar, configurar, testar, implantar
- [FRONTEND.md](../docs/FRONTEND.md) — guia de integração para a UI

Comandos:

```bash
npm run dev            # nodemon + inspector na 9229
npm start              # produção
npm test               # suíte (MongoDB em memória, sem Docker)
npm run seed           # família de exemplo + agenda gerada
npm run seed:destroy
```
