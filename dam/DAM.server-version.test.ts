/**
 * @fileoverview Tests for DAM server version functionality and event proxy system
 * This module tests the enhanced DAM features including server version retrieval
 * and event forwarding from engines.
 * @module dam/DAM.server-version.test
 * @version 1.0.0
 * @author TundraSoft
 * @since 2024-12-28
 * @license MIT
 */

import * as asserts from '$asserts';
import { DAM } from './DAM.ts';
import type { EngineEvents } from './engine/types/mod.ts';

Deno.test({
  name: 'dam.server-version-and-events',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
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

    // Clean up all instances after all tests
    await t.step('cleanup', async () => {
      await DAM.clear();
    });
  },
});
