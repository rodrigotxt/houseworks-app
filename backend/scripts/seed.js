// scripts/seed.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Importa bcrypt
const dotenv = require('dotenv');
const User = require('../models/User');
const Task = require('../models/Task');
const TaskExecutionHistory = require('../models/TaskExecutionHistory');

dotenv.config();

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
    await connectDB();

    console.log('Deletando dados existentes...');
    await User.deleteMany();
    await Task.deleteMany();
    await TaskExecutionHistory.deleteMany();
    console.log('Dados existentes deletados.');

    console.log('Preparando usuários para importação...');
    const hashedUsersData = await Promise.all(
      usersData.map(async (user) => {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);
        return { ...user, password: hashedPassword };
      })
    );

    console.log('Importando usuários...');
    const createdUsers = await User.insertMany(hashedUsersData); // Usa os dados com senhas hashed
    const adminUser = createdUsers[0];
    const isabellaUser = createdUsers[3];

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

    console.log('Importando tarefas...');
    const createdTasks = await Task.insertMany(tasksData);
    const task1 = createdTasks[0];

    const executionHistoryData = [
      {
        task: task1._id,
        executedBy: isabellaUser._id,
        note: 'Banheiro limpo e brilhando!',
        rating: 5,
        completionDate: new Date()
      }
    ];

    console.log('Importando histórico de execução...');
    await TaskExecutionHistory.insertMany(executionHistoryData);

    console.log('Dados importados com sucesso!');
    process.exit();
  } catch (error) {
    console.error(`Erro na importação dos dados: ${error.message}`);
    process.exit(1);
  } finally {
    mongoose.connection.close();
  }
};

const destroyData = async () => {
  try {
    await connectDB();
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

if (process.argv[2] === '-d' || process.argv[2] === '--destroy') {
  destroyData();
} else {
  importData();
}
