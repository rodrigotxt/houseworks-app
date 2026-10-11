// server.js
// Ponto de entrada do processo: conecta ao banco e so entao escuta a porta.

const app = require('./app');
const config = require('./config');
const connectDB = require('./config/db');
const { startScheduler } = require('./jobs/scheduler');
const mongoose = require('mongoose');

const port = config.port;

async function start() {
  await connectDB();

  const server = app.listen(port, () => {
    console.log('Aplicativo Express escutando na porta ' + port);
    console.log('Ambiente: ' + process.env.NODE_ENV);
    console.log('Contrato: /api/v1 (alias de compatibilidade: /api)');
  });

  // O agendador vive no processo do servidor, nao no app: os testes montam o app
  // sem subir cron nenhum.
  startScheduler();

  const shutdown = (signal) => {
    console.log(signal + ' recebido, encerrando...');
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
