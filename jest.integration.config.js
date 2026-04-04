module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/*.integration.spec.ts'],
  globalSetup: './jest.global-setup.ts',
  collectCoverageFrom: [
    'src/proxy/proxy.service.ts',
  ],
};