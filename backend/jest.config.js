// jest.config.js
// maxWorkers: 1 porque cada worker subiria o proprio Mongo em memoria — mais lento e
// desnecessario nesta escala. O binario do mongod fica em cache apos a primeira execucao.

module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  maxWorkers: 1,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middlewares/**/*.js',
    'schemas/**/*.js',
    'utils/**/*.js',
  ],
};
