// scripts/seed.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv'); // Importa dotenv para carregar variáveis de ambiente
const User = require('../models/User'); // Importa seu modelo de Usuário
const Task = require('../models/Task'); // Importa seu modelo de Tarefa
const TaskExecutionHistory = require('../models/TaskExecutionHistory'); // Importa seu modelo de Histórico

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Conecta ao MongoDB (usando a mesma URI do seu app)
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB conectado para seeding...');
  } catch (err) {
    console.error(`Erro na conexão com MongoDB: ${err.message}`);
    process.exit(1);
  }
};

// Dados de exemplo para seed
const usersData = [
  {
    name: 'Rodrigo Martins',
    username: 'admin',
    email: 'contato@rodrigo.inf.br',
    password: 'a1b2c3d4'
  },
  {
    name: 'Geissiane França Soares',
    username: 'geissiane',
    email: 'contato@geissiane.com.br',
    password: 'a1b2c3d4'
  },
  {
    name: 'Arthur Soares Martins',
    username: 'arthur',
    email: 'arthur@rodrigo.inf.br',
    password: 'a1b2c3d4'
  },
  {
    name: 'Isabella Soares Martins',
    username: 'isabella',
    email: 'isabella@rodrigo.inf.br',
    password: 'a1b2c3d4'
  },
  {
    name: 'Luis C. Gabryel Martins',
    username: 'gabryel',
    email: 'gabryel@rodrigo.inf.br',
    password: 'a1b2c3d4'
  }
];

const importData = async () => {
  try {
    await connectDB(); // Conecta ao DB

    // Limpa os dados existentes para evitar duplicatas em cada execução
    console.log('Deletando dados existentes...');
    await User.deleteMany();
    await Task.deleteMany();
    await TaskExecutionHistory.deleteMany();
    console.log('Dados existentes deletados.');

    // Insere os usuários
    console.log('Importando usuários...');
    const createdUsers = await User.insertMany(usersData);
    const adminUser = createdUsers[0]; // Pega o primeiro usuário criado (admin)
    const isabellaUser = createdUsers[3]; // Pega o terceiro usuário criado (Isabella)

    // Dados de tarefas
    const tasksData = [
      {
        name: 'Limpar banheiro',
        frequency: 'semanal',
        difficulty: 'dificil',
        createdBy: adminUser._id
      },
      {
        name: 'Lavar louça',
        frequency: 'diaria',
        difficulty: 'facil',
        createdBy: adminUser._id
      },
      {
        name: 'Tirar o lixo',
        frequency: 'diaria',
        difficulty: 'facil',
        createdBy: adminUser._id
      }
    ];

    // Insere as tarefas
    console.log('Importando tarefas...');
    const createdTasks = await Task.insertMany(tasksData);
    const task1 = createdTasks[0]; // Pega a primeira tarefa criada

    // Dados de histórico de execução
    const executionHistoryData = [
      {
        task: task1._id,
        executedBy: isabellaUser._id,
        note: 'Banheiro limpo e brilhando!',
        rating: 5,
        completionDate: new Date()
      }
    ];

    // Insere o histórico de execução
    console.log('Importando histórico de execução...');
    await TaskExecutionHistory.insertMany(executionHistoryData);

    console.log('Dados importados com sucesso!');
    process.exit(); // Sai do processo com sucesso
  } catch (error) {
    console.error(`Erro na importação dos dados: ${error.message}`);
    process.exit(1); // Sai do processo com erro
  } finally {
    mongoose.connection.close(); // Garante que a conexão com o banco seja fechada
  }
};

// Função para destruir os dados (útil para limpar o DB)
const destroyData = async () => {
  try {
    await connectDB(); // Conecta ao DB
    console.log('Deletando todos os dados...');
    await User.deleteMany();
    await Task.deleteMany();
    await TaskExecutionHistory.deleteMany();
    console.log('Todos os dados deletados com sucesso!');
    process.exit();
  } catch (error) {
    console.error(`Erro ao deletar dados: ${error.message}`);
    process.exit(1);
  } finally {
    mongoose.connection.close();
  }
};

// Verifica qual função deve ser executada com base nos argumentos da linha de comando
if (process.argv[2] === '-d' || process.argv[2] === '--destroy') {
  destroyData();
} else {
  importData();
}
