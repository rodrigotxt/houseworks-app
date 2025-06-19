// config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB conectado com sucesso!');
  } catch (err) {
    console.error('Erro ao conectar com MongoDB:', err.message);
    // Sair do processo com falha
    process.exit(1);
  }
};

module.exports = connectDB;