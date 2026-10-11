// tests/helpers/db.js
// Mongo em memoria por arquivo de teste. O app nao conecta sozinho (ver app.js),
// entao o controle da conexao e todo do harness.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod = null;

async function connect() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

module.exports = { connect, clear, disconnect };
