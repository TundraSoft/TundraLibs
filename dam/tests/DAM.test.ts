import * as asserts from '$asserts';
import { DAM } from '../DAM.ts';

Deno.test('DAM', async (t) => {
  await t.step('register', () => {
    // Register a new engine
    DAM.register('test-db', {
      engine: 'POSTGRES',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgrespw',
      database: 'postgres',
    });

    DAM.register('test-db2', {
      engine: 'SQLITE',
      type: 'MEMORY',
    });

    DAM.register('test-db3', {
      engine: 'MARIA',
      host: 'localhost',
      port: 3306,
      username: 'maria',
      password: 'mariapw',
      database: 'mysql',
    });

    asserts.assertThrows(
      () => {
        DAM.register('test-db2', {
          engine: 'POSTGRES',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgrespw',
          database: 'postgres',
        });
      },
    );
  });

  await t.step('test', async () => {
    // Get the engine instance
    // await DAM.test();

    asserts.assertRejects(
      async () => {
        await DAM.test('non-existent-db');
      },
      Error,
      'Could not find connection profile with the name non-existent-db',
    );
  });

  await t.step('getInstance', () => {
    // Get the engine instance
    const instance = DAM.getInstance('test-db');
    asserts.assertEquals(instance.name, 'test-db');

    // Get the engine instance again
    const instance2 = DAM.getInstance('test-db');
    asserts.assertEquals(instance, instance2);

    // Test with a different engine
    const instance3 = DAM.getInstance('test-db2');
    asserts.assertEquals(instance3.name, 'test-db2');

    // Test with a non-existent engine
    asserts.assertThrows(
      () => {
        DAM.getInstance('non-existent-db');
      },
      Error,
      'Could not find connection profile with the name non-existent-db',
    );
  });

  await t.step('createInstance', () => {
    // Create a new engine instance
    const instance = DAM.createInstance('test-db3');
    asserts.assertEquals(instance.name, 'test-db3');
    const instance2 = DAM.createInstance('test-db3');
    asserts.assertNotEquals(instance, instance2);

    // However with getInstance it will be the same
    const instance3 = DAM.getInstance('test-db3');
    const instance4 = DAM.getInstance('test-db3');
    asserts.assertEquals(instance3, instance4);

    // Test with a non-existent engine
    asserts.assertThrows(
      () => {
        DAM.createInstance('non-existent-db');
      },
      Error,
      'Could not find connection profile with the name non-existent-db',
    );
  });
});
