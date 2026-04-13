import { toError, BrokenCircuitError } from './error.utils';

describe('error.utils', () => {
  describe('toError', () => {
    it('should return the same Error instance when given an Error', () => {
      const error = new Error('original error');
      const result = toError(error);

      expect(result).toBe(error);
    });

    it('should wrap a string in an Error', () => {
      const result = toError('something went wrong');

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('something went wrong');
    });

    it('should wrap a number in an Error', () => {
      const result = toError(42);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('42');
    });

    it('should wrap null in an Error', () => {
      const result = toError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('null');
    });

    it('should wrap undefined in an Error', () => {
      const result = toError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('undefined');
    });

    it('should wrap a plain object in an Error', () => {
      const result = toError({ code: 500 });

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('[object Object]');
    });

    it('should preserve the message of an Error subclass', () => {
      const error = new TypeError('type mismatch');
      const result = toError(error);

      expect(result).toBe(error);
      expect(result.message).toBe('type mismatch');
    });
  });

  describe('BrokenCircuitError', () => {
    it('should be an instance of Error', () => {
      const error = new BrokenCircuitError('http://localhost:3001');

      expect(error).toBeInstanceOf(Error);
    });

    it('should be an instance of BrokenCircuitError', () => {
      const error = new BrokenCircuitError('http://localhost:3001');

      expect(error).toBeInstanceOf(BrokenCircuitError);
    });

    it('should include the target in the message', () => {
      const error = new BrokenCircuitError('http://localhost:3001');

      expect(error.message).toContain('http://localhost:3001');
    });

    it('should have the correct name', () => {
      const error = new BrokenCircuitError('http://localhost:3001');

      expect(error.name).toBe('BrokenCircuitError');
    });

    it('should have a different message for different targets', () => {
      const error1 = new BrokenCircuitError('http://localhost:3001');
      const error2 = new BrokenCircuitError('http://localhost:3002');

      expect(error1.message).not.toBe(error2.message);
    });
  });
});
