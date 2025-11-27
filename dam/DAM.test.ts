import * as asserts from '$asserts';
import { DAM } from './DAM.ts';
import { DAMError } from './errors/mod.ts';

Deno.test('dam.manager', async (t) => {
  // Clear any existing instances before running tests
  await DAM.clear();

  await t.step('Engine Registration', async (t) => {
    await t.step('should have default engines registered', () => {
      const engines = DAM.getRegisteredEngines();
      asserts.assert(engines.includes('POSTGRESQL'));
      asserts.assert(engines.includes('MARIADB'));
      asserts.assert(engines.includes('SQLITE'));
      asserts.assert(engines.includes('MONGODB'));
      asserts.assertEquals(engines.length, 4);
    });

    await t.step('should allow custom engine registration', () => {
      // Create a mock engine class for testing
      class MockEngine {
        constructor(_id: string, _options: unknown) {}
        async connect() {}
        async close() {}
        async execute() {
          return { data: [], count: 0 };
        }
      }

      DAM.addEngine('TEST', MockEngine as any);
      const engines = DAM.getRegisteredEngines();
      asserts.assert(engines.includes('TEST'));
    });

    await t.step('should reject duplicate engine registration', () => {
      class AnotherMockEngine {
        constructor(_id: string, _options: unknown) {}
      }

      asserts.assertThrows(
        () => DAM.addEngine('TEST', AnotherMockEngine as any),
        DAMError,
        'Engine "TEST" is already registered',
      );
    });

    await t.step('should reject invalid engine parameters', () => {
      asserts.assertThrows(
        () => DAM.addEngine('', null as any),
        DAMError,
        'Engine name must be a non-empty string',
      );

      asserts.assertThrows(
        () => DAM.addEngine('INVALID', null as any),
        DAMError,
        'Engine must be a constructor function',
      );
    });

    // Clean up test engine
    DAM.removeEngine('TEST');
  });

  await t.step('Instance Creation', async (t) => {
    await t.step('should create SQLite instance', () => {
      const db = DAM.create('SQLITE', 'test-db', {
        database: ':memory:',
      });

      asserts.assert(db);
      asserts.assertEquals(db.name, 'test-db');
      asserts.assertEquals(DAM.hasInstance('test-db'), true);
    });

    await t.step('should return existing instance on duplicate create', () => {
      const db1 = DAM.getInstance('test-db');
      const db2 = DAM.create('SQLITE', 'test-db', {
        database: ':memory:',
      });

      asserts.assertEquals(db1, db2);
    });

    await t.step('should reject invalid create parameters', () => {
      asserts.assertThrows(
        () => DAM.create('', 'test', {}),
        DAMError,
        'Engine type must be a non-empty string',
      );

      asserts.assertThrows(
        () => DAM.create('SQLITE', '', {}),
        DAMError,
        'Instance ID must be a non-empty string',
      );

      asserts.assertThrows(
        () => DAM.create('SQLITE', 'test', null as any),
        DAMError,
        'Options must be a valid object',
      );
    });

    await t.step('should reject unknown engine type', () => {
      asserts.assertThrows(
        () => DAM.create('UNKNOWN', 'test', {}),
        DAMError,
        'Engine "UNKNOWN" is not registered',
      );
    });

    await t.step(
      'should reject mismatched engine type for existing instance',
      () => {
        asserts.assertThrows(
          () =>
            DAM.create('POSTGRESQL', 'test-db', {
              host: 'localhost',
              database: 'test',
            }),
          DAMError,
          'Instance "test-db" already exists with engine type "SQLITE"',
        );
      },
    );
  });

  await t.step('Instance Management', async (t) => {
    await t.step('should list active instances', () => {
      const instances = DAM.getActiveInstances();
      asserts.assert(instances.includes('test-db'));
    });

    await t.step('should get instance by ID', () => {
      const db = DAM.getInstance('test-db');
      asserts.assert(db);
      asserts.assertEquals(db!.name, 'test-db');
    });

    await t.step('should return undefined for non-existent instance', () => {
      const db = DAM.getInstance('non-existent');
      asserts.assertEquals(db, undefined);
    });

    await t.step('should remove instance', async () => {
      const removed = await DAM.removeInstance('test-db');
      asserts.assertEquals(removed, true);
      asserts.assertEquals(DAM.hasInstance('test-db'), false);
    });

    await t.step(
      'should return false when removing non-existent instance',
      async () => {
        const removed = await DAM.removeInstance('non-existent');
        asserts.assertEquals(removed, false);
      },
    );
  });

  await t.step('Clear All Instances', async (t) => {
    await t.step('should create multiple instances', () => {
      DAM.create('SQLITE', 'db1', { database: ':memory:' });
      DAM.create('SQLITE', 'db2', { database: ':memory:' });

      const instances = DAM.getActiveInstances();
      asserts.assertEquals(instances.length, 2);
    });

    await t.step('should clear all instances', async () => {
      await DAM.clear();
      const instances = DAM.getActiveInstances();
      asserts.assertEquals(instances.length, 0);
    });
  });

  await t.step('Server Version and Events', async (t) => {
    await t.step('Server Version Methods', async (t) => {
      await t.step('should get SQLite server version', async () => {
        const instanceId = 'test-sqlite-version';

        try {
          // Create SQLite instance
          const instance = DAM.create('SQLITE', instanceId, {
            database: ':memory:',
          });

          // Connect to ensure version can be retrieved
          await instance.connect();

          // Get server version
          const version = await instance.getServerVersion();
          asserts.assertEquals(typeof version, 'string');
          asserts.assertEquals(version.startsWith('SQLite'), true);

          // Test cached version (should be same)
          const cachedVersion = await instance.getServerVersion();
          asserts.assertEquals(version, cachedVersion);

          // Refresh version (force new retrieval)
          await instance.refreshServerVersion();
          const refreshedVersion = await instance.getServerVersion();
          asserts.assertEquals(typeof refreshedVersion, 'string');

          // Test detailed pool stats
          const poolStats = instance.getDetailedPoolStats();
          asserts.assertEquals(typeof poolStats, 'object');
          asserts.assertEquals(poolStats !== null, true);
          if (poolStats) {
            asserts.assertEquals(typeof poolStats.totalConnections, 'number');
            asserts.assertEquals(typeof poolStats.activeConnections, 'number');
          }

          await instance.close();
        } finally {
          await DAM.removeInstance(instanceId);
        }
      });

      await t.step(
        'should reject version request when not connected',
        async () => {
          const instanceId = 'test-sqlite-not-connected';

          try {
            // Create SQLite instance but don't connect
            const instance = DAM.create('SQLITE', instanceId, {
              database: ':memory:',
            });

            // Should reject when not connected
            await asserts.assertRejects(
              () => instance.getServerVersion(),
              Error,
              'not connected',
            );
          } finally {
            await DAM.removeInstance(instanceId);
          }
        },
      );
    });

    await t.step('Engine Instance Version Methods', async (t) => {
      await t.step('should retrieve server version via instance', async () => {
        const instanceId = 'test-instance-version';

        try {
          // Create SQLite instance
          const instance = DAM.create('SQLITE', instanceId, {
            database: ':memory:',
          });

          // Connect and get version
          await instance.connect();
          const version = await instance.getServerVersion();

          asserts.assertEquals(typeof version, 'string');
          asserts.assertEquals(version.startsWith('SQLite'), true);

          await instance.close();
        } finally {
          await DAM.removeInstance(instanceId);
        }
      });

      await t.step('should cache server version between calls', async () => {
        const instanceId = 'test-version-caching';

        try {
          // Create SQLite instance
          const instance = DAM.create('SQLITE', instanceId, {
            database: ':memory:',
          });

          await instance.connect();

          // Get version twice - should be same (cached)
          const version1 = await instance.getServerVersion();
          const version2 = await instance.getServerVersion();

          asserts.assertEquals(version1, version2);

          // Force refresh and get again
          await instance.refreshServerVersion();
          const version3 = await instance.getServerVersion();

          asserts.assertEquals(typeof version3, 'string');
          asserts.assertEquals(version3.startsWith('SQLite'), true);

          await instance.close();
        } finally {
          await DAM.removeInstance(instanceId);
        }
      });
    });
  });

  await t.step('Edge Cases', async (t) => {
    await t.step('should handle invalid parameters gracefully', () => {
      asserts.assertEquals(DAM.getInstance(''), undefined);
      asserts.assertEquals(DAM.getInstance(null as any), undefined);
      asserts.assertEquals(DAM.hasInstance(''), false);
      asserts.assertEquals(DAM.hasInstance(null as any), false);
    });

    await t.step('should handle engine name case insensitivity', () => {
      const db1 = DAM.create('sqlite', 'db-lowercase', {
        database: ':memory:',
      });
      const db2 = DAM.create('SQLITE', 'db-uppercase', {
        database: ':memory:',
      });

      asserts.assert(db1);
      asserts.assert(db2);
    });

    // Clean up
    await DAM.clear();
  });
});
