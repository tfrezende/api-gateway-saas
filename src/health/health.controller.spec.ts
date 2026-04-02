import { HealthController } from './health.controller';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(() => {
    healthController = new HealthController();
  });

  describe('healthCheck', () => {
    it('should return status ok and a valid timestamp', () => {
      const response = healthController.healthCheck();
      expect(response.status).toBe('ok');
      expect(new Date(response.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('version', () => {
    it('should return version and name from environment variables', () => {
      process.env.npm_package_version = '1.0.0';
      process.env.npm_package_name = 'api-gateway';

      const response = healthController.version();
      expect(response.version).toBe('1.0.0');
      expect(response.name).toBe('api-gateway');
    });

    it('should return unknown and api-gateway if environment variables are not set', () => {
      delete process.env.npm_package_version;
      delete process.env.npm_package_name;

      const response = healthController.version();
      expect(response.version).toBe('unknown');
      expect(response.name).toBe('api-gateway');
    });
  });
});
