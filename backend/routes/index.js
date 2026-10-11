// routes/index.js
// Rotas SEM prefixo de versao: app.js monta este router em /api/v1 e, temporariamente,
// tambem em /api (alias de compatibilidade para o frontend atual).

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const packageJson = require('../package.json');
const { ok } = require('../utils/respond');

const authRoutes = require('./auth');
const taskRoutes = require('./task');
const taskExecutionHistoryRoutes = require('./taskExecutionHistory');

// GET /health — smoke test de integracao e healthcheck do container. Nao exige autenticacao.
router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  if (!connected) {
    return res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Banco de dados indisponivel.',
        details: [],
        requestId: req.id,
      },
    });
  }

  return ok(res, {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    version: packageJson.version,
    database: 'connected',
  });
});

router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/tasks-executions', taskExecutionHistoryRoutes);

module.exports = router;
