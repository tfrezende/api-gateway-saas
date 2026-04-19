import {
  IdempotencyStoreService,
  StoredResponse,
} from './idempotency-store.service';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('IdempotencyStoreService', () => {
  let service: IdempotencyStoreService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IdempotencyStoreService(mockRedis as never);
  });

  describe('get()', () => {
    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await service.get('key')).toBeNull();
    });

    it('should return "processing" when sentinel is stored', async () => {
      mockRedis.get.mockResolvedValue('processing');
      expect(await service.get('key')).toBe('processing');
    });

    it('should return parsed StoredResponse when JSON is stored', async () => {
      const stored: StoredResponse = {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: '{"id":1}',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(stored));
      expect(await service.get('key')).toEqual(stored);
    });
  });

  describe('setProcessing()', () => {
    it('should call SET with NX and 30s TTL and return true when acquired', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.setProcessing('key');
      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'key',
        'processing',
        'PX',
        30_000,
        'NX',
      );
    });

    it('should return false when NX lock is already held', async () => {
      mockRedis.set.mockResolvedValue(null);
      const result = await service.setProcessing('key');
      expect(result).toBe(false);
    });
  });

  describe('set()', () => {
    it('should serialise the value and set with given TTL', async () => {
      const stored: StoredResponse = {
        statusCode: 200,
        headers: {},
        body: 'ok',
      };
      mockRedis.set.mockResolvedValue('OK');
      await service.set('key', stored, 86_400_000);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify(stored),
        'PX',
        86_400_000,
      );
    });
  });

  describe('delete()', () => {
    it('should call DEL with the given key', async () => {
      mockRedis.del.mockResolvedValue(1);
      await service.delete('key');
      expect(mockRedis.del).toHaveBeenCalledWith('key');
    });
  });
});
