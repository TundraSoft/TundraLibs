import { CacheValue, RedisCacher } from './RedisCacher';

describe('RedisCacher', () => {
  let cacher: RedisCacher;

  beforeEach(() => {
    // Initialize the RedisCacher with mock options
    const options = {
      host: 'localhost',
      port: 6379,
      password: 'password',
      db: 0,
      tls: true,
    };
    cacher = new RedisCacher(options);
  });

  afterEach(() => {
    // Reset the RedisCacher instance after each test
    cacher = undefined;
  });

  describe('_has', () => {
    it('should return true if the key exists in the cache', async () => {
      // Arrange
      const key = 'test-key';
      const existsMock = jest.fn().mockResolvedValue(1);
      cacher['_client'] = {
        exists: existsMock,
      } as any;

      // Act
      const result = await cacher._has(key);

      // Assert
      expect(existsMock).toHaveBeenCalledWith(key);
      expect(result).toBe(true);
    });

    it('should return false if the key does not exist in the cache', async () => {
      // Arrange
      const key = 'non-existent-key';
      const existsMock = jest.fn().mockResolvedValue(0);
      cacher['_client'] = {
        exists: existsMock,
      } as any;

      // Act
      const result = await cacher._has(key);

      // Assert
      expect(existsMock).toHaveBeenCalledWith(key);
      expect(result).toBe(false);
    });
  });

  describe('_set', () => {
    it('should set the value in the cache with expiry if greater than 0', async () => {
      // Arrange
      const key = 'test-key';
      const value: CacheValue = {
        data: 'test-value',
        expiry: 3600,
      };
      const setMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        set: setMock,
      } as any;

      // Act
      await cacher._set(key, value);

      // Assert
      expect(setMock).toHaveBeenCalledWith(key, JSON.stringify(value), {
        ex: value.expiry,
      });
    });

    it('should set the value in the cache without expiry if 0', async () => {
      // Arrange
      const key = 'test-key';
      const value: CacheValue = {
        data: 'test-value',
        expiry: 0,
      };
      const setMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        set: setMock,
      } as any;

      // Act
      await cacher._set(key, value);

      // Assert
      expect(setMock).toHaveBeenCalledWith(key, JSON.stringify(value));
    });
  });

  describe('_get', () => {
    it('should return the value from the cache if it exists', async () => {
      // Arrange
      const key = 'test-key';
      const value: CacheValue<string> = {
        data: 'test-value',
        expiry: 3600,
      };
      const getMock = jest.fn().mockResolvedValue(JSON.stringify(value));
      cacher['_client'] = {
        get: getMock,
      } as any;

      // Act
      const result = await cacher._get<string>(key);

      // Assert
      expect(getMock).toHaveBeenCalledWith(key);
      expect(result).toEqual(value);
    });

    it('should return undefined if the value does not exist in the cache', async () => {
      // Arrange
      const key = 'non-existent-key';
      const getMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        get: getMock,
      } as any;

      // Act
      const result = await cacher._get<string>(key);

      // Assert
      expect(getMock).toHaveBeenCalledWith(key);
      expect(result).toBeUndefined();
    });
  });

  describe('_delete', () => {
    it('should delete the value from the cache', async () => {
      // Arrange
      const key = 'test-key';
      const delMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        del: delMock,
      } as any;

      // Act
      await cacher._delete(key);

      // Assert
      expect(delMock).toHaveBeenCalledWith(key);
    });
  });

  describe('_clear', () => {
    it('should clear all keys belonging to this cache', async () => {
      // Arrange
      const cacheName = 'test-cache';
      const keys = ['test-key1', 'test-key2'];
      const keysMock = jest.fn().mockResolvedValue(keys);
      const delMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        keys: keysMock,
        del: delMock,
      } as any;
      cacher['_getOption'] = jest.fn().mockReturnValue(cacheName);

      // Act
      await cacher._clear();

      // Assert
      expect(keysMock).toHaveBeenCalledWith(`${cacheName}:*`);
      expect(delMock).toHaveBeenCalledWith(...keys);
    });

    it('should not attempt to delete keys if there are no keys in the cache', async () => {
      // Arrange
      const keysMock = jest.fn().mockResolvedValue(undefined);
      const delMock = jest.fn().mockResolvedValue(undefined);
      cacher['_client'] = {
        keys: keysMock,
        del: delMock,
      } as any;

      // Act
      await cacher._clear();

      // Assert
      expect(keysMock).toHaveBeenCalledWith(expect.any(String));
      expect(delMock).not.toHaveBeenCalled();
    });
  });

  describe('_init', () => {
    it('should initialize the Redis client if it is not already initialized', async () => {
      // Arrange
      cacher['_client'] = undefined;
      const connectOptions = {
        hostname: 'localhost',
        port: 6379,
        password: 'password',
        db: 0,
        tls: true,
      };
      const redisConnectMock = jest.fn().mockResolvedValue({} as any);
      cacher['RedisConnect'] = jest.fn(() => redisConnectMock);

      // Act
      await cacher['_init']();

      // Assert
      expect(cacher['_client']).toBeDefined();
      expect(redisConnectMock).toHaveBeenCalledWith(connectOptions);
    });

    it('should not initialize the Redis client if it is already initialized', async () => {
      // Arrange
      cacher['_client'] = {} as any;
      const redisConnectMock = jest.fn().mockResolvedValue({} as any);
      cacher['RedisConnect'] = jest.fn(() => redisConnectMock);

      // Act
      await cacher['_init']();

      // Assert
      expect(redisConnectMock).not.toHaveBeenCalled();
    });
  });
});
