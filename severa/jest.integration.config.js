module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/*.test.ts']
};
