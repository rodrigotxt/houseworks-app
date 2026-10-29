// routes/index.js
// Rotas SEM prefixo de versao: app.js monta este router em /api/v1 e, temporariamente,
// tambem em /api (alias de compatibilidade para o frontend atual).

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const packageJson = require('../package.json');
const { ok } = require('../utils/respond');

const authRoutes = require('./auth');
const householdRoutes = require('./household');
const taskRoutes = require('./task');
const occurrenceRoutes = require('./occurrence');
const executionRoutes = require('./execution');
const reminderRoutes = require('./reminder');
const meRoutes = require('./me');

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

// /households tambem monta as rotas aninhadas de tarefas e execucoes.
router.use('/households', householdRoutes);

router.use('/tasks', taskRoutes);
router.use('/occurrences', occurrenceRoutes);
router.use('/executions', executionRoutes);
router.use('/reminders', reminderRoutes);
router.use('/me', meRoutes);

module.exports = router;
