// routes/index.js
const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const taskRoutes = require('./task');
const taskExecutionHistoryRoutes = require('./taskExecutionHistory');

router.get('/', (req, res) => {
  res.send('Hello Docker Compose from Node.js!'); // Rota principal
});

router.use('/api/auth', authRoutes);
router.use('/api/tasks', taskRoutes);
router.use('/api/tasks-executions', taskExecutionHistoryRoutes);

module.exports = router;