// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Importa o modelo User
const config = require('../config'); // Importa configurações (para jwtSecret)

// Lógica para registrar um novo usuário
exports.registerUser = async (req, res) => {
  const { name, username, email, password } = req.body;

  // As validações básicas de `required` já estão no schema Mongoose
  // Aqui você pode adicionar validações de negócio mais complexas, se houver

  try {
    // 1. Verificar se o usuário já existe por email ou username
    let userExists = await User.findByEmailOrUsername(email); // Pode usar email para esta verificação inicial
    if (userExists) {
        // Se o usuário existir, verifique qual campo já existe
        if (userExists.email === email && userExists.username === username) {
            return res.status(400).json({ message: 'Email e nome de usuário já registrados.' });
        } else if (userExists.email === email) {
            return res.status(400).json({ message: 'Email já registrado.' });
        } else if (userExists.username === username) {
            return res.status(400).json({ message: 'Nome de usuário já registrado.' });
        }
    }


    // 2. Criar e salvar o novo usuário (a senha será criptografada automaticamente pelo middleware 'pre-save')
    const newUser = new User({
      name,
      username,
      email,
      password, // A senha será criptografada pelo middleware 'pre-save' no modelo
    });

    await newUser.save();

    res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: newUser._id });

  } catch (error) {
    // Erros de validação do Mongoose (ex: unique, required)
    if (error.code === 11000) { // Erro de duplicidade (unique)
      return res.status(400).json({ message: 'Dados duplicados. Email ou nome de usuário já em uso.' });
    }
    // Erros de validação do schema (se não usar unique para todos os campos)
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({ message: messages.join(', ') });
    }

    console.error('Erro ao registrar usuário:', error);
    res.status(500).send('Erro interno do servidor ao registrar usuário.');
  }
};

// Lógica para autenticar o usuário e gerar JWT
exports.loginUser = async (req, res) => {
  const { username, email, password } = req.body;
  
  let identifier = username || email;

  // Validação simples de entrada
  if (!identifier || !password) {
    return res.status(400).json({ message: 'Por favor, forneça identificador (email/username) e senha.' });
  }

  try {
    // 1. Buscar o usuário por email ou username usando o método estático
    const user = await User.findByEmailOrUsername(identifier);
    if (!user) {
      return res.status(400).json({ message: 'Credenciais inválidas.' }); // Não revela se é usuário ou senha errada
    }

    // 2. Comparar a senha fornecida com a senha criptografada usando o método de instância
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciais inválidas.' });
    }

    // 3. Gerar o token JWT
    const payload = {
      user: {
        id: user.id,
        email: user.email,
        username: user.username // Incluir username no payload
      },
    };

    jwt.sign(
      payload,
      config.jwtSecret, // Usando o segredo do arquivo de configuração
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );

  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).send('Erro interno do servidor ao fazer login.');
  }
};