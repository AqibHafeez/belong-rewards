import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/integration/**/*.integration.test.ts'],
  setupFiles: ['<rootDir>/test-utils/integrationEnv.ts'],
  globalSetup: '<rootDir>/test-utils/globalSetup.ts',
  globalTeardown: '<rootDir>/test-utils/globalTeardown.ts',
  testTimeout: 60_000,
  forceExit: true,
  clearMocks: true,
};

export default config;
