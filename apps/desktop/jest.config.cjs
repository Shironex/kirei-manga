/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@kireimanga/shared$': '<rootDir>/../../packages/shared/dist',
    '^@kireimanga/shared/(.*)$': '<rootDir>/../../packages/shared/dist/$1',
  },
};
