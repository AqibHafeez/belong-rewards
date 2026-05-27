import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  globalSetup: './test-utils/globalSetup.ts',
  globalTeardown: './test-utils/globalTeardown.ts',
  testTimeout: 30000,
  forceExit: true,
  clearMocks: true,
};

export default config;
