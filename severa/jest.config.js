module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/*.test.ts'],
  // tests/integration/** requiere un Postgres real corriendo (ver
  // jest.integration.config.js) — se excluye de la suite normal (mockea todo,
  // nunca dependió de una base de datos) para que "npm test" siga
  // funcionando igual que siempre en cualquier entorno sin Docker levantado.
  // Correr los de integración con "npm run test:integration".
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts']
};
