module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/*.integration.spec.ts'],
  collectCoverageFrom: [
    'src/proxy/proxy.service.ts',
  ],
};