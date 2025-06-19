// server.js
const app = require('./app')
const config = require('./config');

const port = config.port;

app.listen(port, () => {
  console.log(`Aplicativo Express escutando na porta ${port}`);
  console.log(`Ambiente: ${process.env.NODE_ENV}`);
});