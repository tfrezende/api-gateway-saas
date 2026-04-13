module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/*.spec.ts'],
      testPathIgnorePatterns: ['.*\\.integration\\.spec\\.ts$'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      setupFiles: ['./jest.setup.ts'],
    },
    {
      displayName: 'integration',
      testMatch: ['**/*.integration.spec.ts'],
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      setupFiles: ['./jest.setup.ts'],
      globalSetup: './jest.global-setup.ts',
    },
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/jest.setup.ts',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
    },
  },
};
