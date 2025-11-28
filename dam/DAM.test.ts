import * as asserts from 'jsr:@std/assert@1';
import { DAM } from './DAM.ts';
import { AbstractEngine } from './engine/mod.ts';
import { DAMError } from './errors/mod.ts';
import type { EngineOptions } from './engine/mod.ts';

// Mock engine for testing
class MockEngine extends AbstractEngine {
  public readonly Engine = 'MOCK';

  public readonly Capabilities = {
    transactions: false,
    pooledConnections: false,
    preparedStatements: false,
  };

  // Required property for transaction client mapping
  protected _clientMap: Map<string, unknown> = new Map();

  constructor(name: string, options: EngineOptions) {
    super(name, options);
  }

  protected async _connect(): Promise<void> {
    // Mock connect
  }

  protected async _disconnect(): Promise<void> {
    // Mock disconnect
  }

  protected async _execute<R = Record<string, unknown>>(
    // deno-lint-ignore no-unused-vars
    query: { sql: string; params?: Record<string, unknown> },
  ): Promise<{ data: R[]; count: number }> {
    return { data: [], count: 0 };
  }

  // deno-lint-ignore no-unused-vars
  protected _beginTransaction(transactionId: string): void | Promise<void> {
    // Mock - no-op since transactions not supported
  }

  protected async _commitTransaction(
    // deno-lint-ignore no-unused-vars
    transactionId: string,
  ): Promise<void> {
    // Mock - no-op
  }

  protected async _rollbackTransaction(
    // deno-lint-ignore no-unused-vars
    transactionId: string,
  ): Promise<void> {
    // Mock - no-op
  }

  protected async _ping(): Promise<boolean> {
    return true;
  }

  // Mock implementation for required methods
  protected _updatePoolStatus(): void {
    // Mock - no-op
  }
}

const DEFAULT_OPTIONS: EngineOptions & Record<string, unknown> = {
  slowQueryThreshold: 300, // 300 seconds (5 minutes)
  transactionTimeout: 30, // 30 seconds
  autoRollbackOnFailure: false,
};

Deno.test({
  name: 'dam.manager',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step('engine registration', async (u) => {
      await u.step('should have default engines registered', () => {
        const engines = DAM.getRegisteredEngines();
        asserts.assertEquals(engines.includes('SQLITE'), true);
        asserts.assertEquals(engines.includes('MONGODB'), true);
        asserts.assertEquals(engines.includes('POSTGRES'), true);
        asserts.assertEquals(engines.includes('POSTGRES2'), true);
        asserts.assertEquals(engines.includes('MARIA'), true);
        asserts.assertEquals(engines.length, 5);
      });

      await u.step('should add custom engine', () => {
        DAM.addEngine('MOCK', MockEngine as never);
        const engines = DAM.getRegisteredEngines();
        asserts.assertEquals(engines.includes('MOCK'), true);
      });

      await u.step('should normalize engine name to uppercase', () => {
        DAM.addEngine('custom', MockEngine as never);
        const engines = DAM.getRegisteredEngines();
        asserts.assertEquals(engines.includes('CUSTOM'), true);
      });

      await u.step('should throw error for duplicate engine', () => {
        asserts.assertThrows(
          () => DAM.addEngine('MOCK', MockEngine as never),
          DAMError,
          'Engine "MOCK" is already registered',
        );
      });

      await u.step('should throw error for invalid engine name', () => {
        asserts.assertThrows(
          () => DAM.addEngine('', MockEngine as never),
          DAMError,
          'Engine name must be a non-empty string',
        );

        asserts.assertThrows(
          () => DAM.addEngine(null as unknown as string, MockEngine as never),
          DAMError,
          'Engine name must be a non-empty string',
        );
      });

      await u.step('should throw error for invalid engine constructor', () => {
        asserts.assertThrows(
          () => DAM.addEngine('INVALID', null as never),
          DAMError,
          'Engine must be a constructor function',
        );

        asserts.assertThrows(
          () => DAM.addEngine('INVALID', 'not-a-function' as never),
          DAMError,
          'Engine must be a constructor function',
        );
      });

      await u.step('should remove engine', () => {
        const removed = DAM.removeEngine('CUSTOM');
        asserts.assertEquals(removed, true);
        const engines = DAM.getRegisteredEngines();
        asserts.assertEquals(engines.includes('CUSTOM'), false);
      });

      await u.step(
        'should return false for non-existent engine removal',
        () => {
          const removed = DAM.removeEngine('NONEXISTENT');
          asserts.assertEquals(removed, false);
        },
      );
    });

    await t.step('instance creation', async (u) => {
      await u.step('should create new instance', () => {
        const instance = DAM.create('MOCK', 'test-db', DEFAULT_OPTIONS);
        asserts.assertExists(instance);
        asserts.assertInstanceOf(instance, AbstractEngine);
        asserts.assertEquals(instance.Name, 'test-db');
      });

      await u.step('should return existing instance with same name', () => {
        const instance1 = DAM.create('MOCK', 'test-db', DEFAULT_OPTIONS);
        const instance2 = DAM.create('MOCK', 'test-db', DEFAULT_OPTIONS);
        asserts.assertEquals(instance1, instance2);
      });

      await u.step(
        'should throw error when creating instance with same name but different engine',
        () => {
          DAM.create('MOCK', 'conflict-db', DEFAULT_OPTIONS);
          // Try to recreate with different engine - add another mock
          DAM.addEngine('MOCK2', MockEngine as never);
          asserts.assertThrows(
            () => DAM.create('MOCK2', 'conflict-db', DEFAULT_OPTIONS),
            DAMError,
            'Instance "conflict-db" already exists with engine type "MOCK"',
          );
        },
      );

      await u.step('should normalize instance name', () => {
        const instance1 = DAM.create('MOCK', ' spaced-name ', DEFAULT_OPTIONS);
        const instance2 = DAM.create('MOCK', 'spaced-name', DEFAULT_OPTIONS);
        asserts.assertEquals(instance1, instance2);
      });

      await u.step('should throw error for unregistered engine', () => {
        asserts.assertThrows(
          () => DAM.create('UNREGISTERED', 'test', DEFAULT_OPTIONS),
          DAMError,
          'Engine "UNREGISTERED" is not registered',
        );
      });

      await u.step('should throw error for invalid parameters', () => {
        asserts.assertThrows(
          () => DAM.create('', 'test', DEFAULT_OPTIONS),
          DAMError,
          'Engine type must be a non-empty string',
        );

        asserts.assertThrows(
          () => DAM.create('MOCK', '', DEFAULT_OPTIONS),
          DAMError,
          'Instance name must be a non-empty string',
        );

        asserts.assertThrows(
          () => DAM.create('MOCK', 'test', null as never),
          DAMError,
          'Options must be a valid object',
        );

        asserts.assertThrows(
          () => DAM.create('MOCK', 'test', [] as never),
          DAMError,
          'Options must be a valid object',
        );
      });
    });

    await t.step('instance retrieval', async (u) => {
      await u.step('should get existing instance', () => {
        DAM.create('MOCK', 'retrieve-test', DEFAULT_OPTIONS);
        const instance = DAM.getInstance('retrieve-test');
        asserts.assertExists(instance);
        asserts.assertEquals(instance?.Name, 'retrieve-test');
      });

      await u.step('should return undefined for non-existent instance', () => {
        const instance = DAM.getInstance('non-existent');
        asserts.assertEquals(instance, undefined);
      });

      await u.step('should handle invalid name gracefully', () => {
        const instance1 = DAM.getInstance('');
        asserts.assertEquals(instance1, undefined);

        const instance2 = DAM.getInstance(null as unknown as string);
        asserts.assertEquals(instance2, undefined);
      });

      await u.step('should check if instance exists', () => {
        DAM.create('MOCK', 'exists-test', DEFAULT_OPTIONS);
        asserts.assertEquals(DAM.hasInstance('exists-test'), true);
        asserts.assertEquals(DAM.hasInstance('non-existent'), false);
        asserts.assertEquals(DAM.hasInstance(''), false);
      });
    });

    await t.step('instance management', async (u) => {
      await u.step('should get list of active instances', () => {
        // Clear first
        const instances = DAM.getActiveInstances();
        asserts.assert(instances.length > 0);
        asserts.assert(instances.includes('test-db'));
        asserts.assert(instances.includes('retrieve-test'));
      });

      await u.step('should remove instance', async () => {
        DAM.create('MOCK', 'remove-test', DEFAULT_OPTIONS);
        const removed = await DAM.removeInstance('remove-test');
        asserts.assertEquals(removed, true);
        asserts.assertEquals(DAM.hasInstance('remove-test'), false);
      });

      await u.step(
        'should return false for non-existent instance removal',
        async () => {
          const removed = await DAM.removeInstance('non-existent');
          asserts.assertEquals(removed, false);
        },
      );

      await u.step(
        'should handle invalid name gracefully on removal',
        async () => {
          const removed1 = await DAM.removeInstance('');
          asserts.assertEquals(removed1, false);

          const removed2 = await DAM.removeInstance(null as unknown as string);
          asserts.assertEquals(removed2, false);
        },
      );

      await u.step('should clear all instances', async () => {
        DAM.create('MOCK', 'clear-test-1', DEFAULT_OPTIONS);
        DAM.create('MOCK', 'clear-test-2', DEFAULT_OPTIONS);

        await DAM.clear();

        const instances = DAM.getActiveInstances();
        asserts.assertEquals(instances.length, 0);
      });
    });

    await t.step('integration tests', async (u) => {
      await u.step('should create SQLite instance', () => {
        const db = DAM.create('SQLITE', 'sqlite-test', {
          database: 'test.db', // SQLite requires database field
          filename: ':memory:',
          slowQueryThreshold: 300,
          transactionTimeout: 30,
          autoRollbackOnFailure: false,
        });
        asserts.assertExists(db);
        asserts.assertEquals(db.Engine, 'SQLITE');
      });

      await u.step('should handle multiple different instances', () => {
        const sqlite = DAM.create('SQLITE', 'sqlite-multi', {
          database: 'test2.db', // SQLite requires database field
          filename: ':memory:',
          slowQueryThreshold: 300,
          transactionTimeout: 30,
          autoRollbackOnFailure: false,
        });
        const mock = DAM.create('MOCK', 'mock-multi', DEFAULT_OPTIONS);

        asserts.assertEquals(sqlite.Engine, 'SQLITE');
        asserts.assertEquals(mock.Engine, 'MOCK');
        asserts.assertNotEquals(sqlite, mock);
      });

      await u.step('should track instance engines correctly', () => {
        const engines = DAM.getRegisteredEngines();
        const instances = DAM.getActiveInstances();

        asserts.assert(engines.length >= 6); // At least the default engines + MOCK
        asserts.assert(instances.length >= 2); // At least the ones we just created
      });

      await u.step('should cleanup instances properly', async () => {
        await DAM.removeInstance('sqlite-test');
        await DAM.removeInstance('sqlite-multi');
        await DAM.removeInstance('mock-multi');

        asserts.assertEquals(DAM.hasInstance('sqlite-test'), false);
        asserts.assertEquals(DAM.hasInstance('sqlite-multi'), false);
        asserts.assertEquals(DAM.hasInstance('mock-multi'), false);
      });
    });

    // Cleanup after all tests
    await DAM.clear();
  },
});
