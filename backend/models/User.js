// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Importe bcrypt para o pré-save

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true }, // Adicionado trim
  username: {
    type: String,
    required: [true, 'Nome de usuário é obrigatório.'], // Mensagem de erro customizada
    unique: true,
    trim: true,
    minlength: [3, 'Nome de usuário deve ter no mínimo 3 caracteres.'],
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório.'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido.'] // Validação de formato
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória.'],
    minlength: [6, 'Senha deve ter no mínimo 6 caracteres.']
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Instante da ultima troca de senha. Serve para derrubar as sessoes que ja existiam:
  // qualquer token emitido ANTES deste instante deixa de valer (ver middlewares/auth.js).
  //
  // Nao existe revogacao em massa por jti — a lista de revogados guarda um identificador
  // por token, e nao ha como listar os de um usuario. Comparar com o `iat` do token resolve
  // o mesmo problema sem manter estado por sessao.
  passwordChangedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true, // Adiciona automaticamente `createdAt` e `updatedAt`
  // toObject E toJSON: documentos populados usam o toObject do schema filho.
  toObject: require('../config/serialization').createJsonOptions(),
  toJSON: require('../config/serialization').createJsonOptions(),
});

// Método estático para buscar usuário por email ou username
UserSchema.statics.findByEmailOrUsername = async function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier },
      { username: identifier }
    ]
  });
};

// Middleware para criptografar a senha antes de salvar
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) { // Só criptografa se a senha foi modificada (ou é nova)
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar senhas
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


const User = mongoose.model('User', UserSchema);

module.exports = User;