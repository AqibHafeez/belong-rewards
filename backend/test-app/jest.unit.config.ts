import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '!**/__tests__/integration/**',
  ],
  testTimeout: 10000,
  forceExit: true,
  clearMocks: true,
};

export default config;
