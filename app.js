// app.js
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello Docker Compose from Node.js Express App!');
});

app.listen(port, () => {
  console.log(`Aplicativo Express escutando na porta ${port}`);
});
