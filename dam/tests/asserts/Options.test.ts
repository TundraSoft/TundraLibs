import { assertEquals } from '../../../dev.dependencies.ts';
import {
  assertClientOptions,
  assertMariaOptions,
  assertMongoOptions,
  assertPostgresOptions,
  assertSQLiteOptions,
} from '../../mod.ts';

/**
 * @todo - ADD TLS Test case, refine SQLite options. See if Postgres can be changed to Postgresjs
 */
Deno.test('DAM > asserts > Options', async (t) => {
  await t.step('Client', () => {
    assertEquals(
      true,
      assertClientOptions({ dialect: 'MARIA', slowQueryThreshold: 10 }),
    );
    assertEquals(
      true,
      assertClientOptions({ dialect: 'MONGO', slowQueryThreshold: 10 }),
    );
    assertEquals(
      true,
      assertClientOptions({ dialect: 'POSTGRES', slowQueryThreshold: 10 }),
    );
    assertEquals(
      true,
      assertClientOptions({ dialect: 'SQLITE', slowQueryThreshold: 10 }),
    );
    assertEquals(
      false,
      assertClientOptions({ dialect: 'SQLITE', slowQueryThreshold: 0 }),
    );
    assertEquals(
      false,
      assertClientOptions({ dialect: 'SQLITE', slowQueryThreshold: 'sdf' }),
    );
    assertEquals(
      false,
      assertClientOptions({ dialect: 'SQLITE', slowQueryThreshold: -1 }),
    );
    assertEquals(false, assertClientOptions({ dialect: 'MARIAS' }));
    assertEquals(false, assertClientOptions({ dialect: 'MONGOD' }));
    assertEquals(false, assertClientOptions({ some: 'MONGOD' }));
  });

  await t.step('Maria', () => {
    // Valid
    assertEquals(
      true,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      true,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        username: 'user',
        password: 'pass',
        database: 'db',
      }),
    );

    // Invalid Dialect
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIADB',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    // Host
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: null,
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: '',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Port
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: -1,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 65536,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: '3306',
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Username
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: null,
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: '',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Password
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: null,
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: '',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Database
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: null,
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: '',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Connection timeout
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: -1,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 45,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 'sd',
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Idle timeout
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: -1,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 'adf',
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Pool size
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 0,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMariaOptions({
        dialect: 'MARIA',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 'sdf',
        tls: { enabled: true },
      }),
    );

    // TLS
  });

  await t.step('Postgres', () => {
    assertEquals(
      true,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Invalid Dialect
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRESQL',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    // Host
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: null,
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: '',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Port
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: -1,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 65536,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: '3306',
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Username
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: null,
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: '',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Password
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: null,
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: '',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Database
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: null,
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: '',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Connection timeout
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: -1,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 45,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 'sd',
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Idle timeout
    // assertEquals(false, assertPostgresOptions({ dialect: 'POSTGRES', host: 'some-host', port: 1234, username: 'user', password: 'pass', database: 'db', connectionTimeout: 10, idleTimeout: -1, poolSize: 10, tls: { enabled: true } }));
    // assertEquals(false, assertPostgresOptions({ dialect: 'POSTGRES', host: 'some-host', port: 1234, username: 'user', password: 'pass', database: 'db', connectionTimeout: 10, idleTimeout: 'adf', poolSize: 10, tls: { enabled: true } }));

    // Pool size
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 0,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertPostgresOptions({
        dialect: 'POSTGRES',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 'sdf',
        tls: { enabled: true },
      }),
    );
  });

  await t.step('Mongo', () => {
    // Valid
    assertEquals(
      true,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      true,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        username: 'user',
        password: 'pass',
        database: 'db',
      }),
    );

    // Invalid Dialect
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGODB',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    // Host
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: null,
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: '',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Port
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: -1,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 65536,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: '3306',
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Username
    // assertEquals(false, assertMongoOptions({ dialect: 'MONGO', host: 'some-host', port: 1234, password: 'pass', database: 'db', connectionTimeout: 10, idleTimeout: 10, poolSize: 10, tls: { enabled: true } }));
    // assertEquals(false, assertMongoOptions({ dialect: 'MONGO', host: 'some-host', port: 1234, username: null, password: 'pass', database: 'db', connectionTimeout: 10, idleTimeout: 10, poolSize: 10, tls: { enabled: true } }));
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: '',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Password
    // assertEquals(false, assertMongoOptions({ dialect: 'MONGO', host: 'some-host', port: 1234, username: 'user', database: 'db', connectionTimeout: 10, idleTimeout: 10, poolSize: 10, tls: { enabled: true } }));
    // assertEquals(false, assertMongoOptions({ dialect: 'MONGO', host: 'some-host', port: 1234, username: 'user', password: null, database: 'db', connectionTimeout: 10, idleTimeout: 10, poolSize: 10, tls: { enabled: true } }));
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: '',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Database
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: null,
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: '',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Connection timeout
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: -1,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 45,
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 'sd',
        idleTimeout: 10,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Idle timeout
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: -1,
        poolSize: 10,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 'adf',
        poolSize: 10,
        tls: { enabled: true },
      }),
    );

    // Pool size
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 0,
        tls: { enabled: true },
      }),
    );
    assertEquals(
      false,
      assertMongoOptions({
        dialect: 'MONGO',
        host: 'some-host',
        port: 1234,
        username: 'user',
        password: 'pass',
        database: 'db',
        connectionTimeout: 10,
        idleTimeout: 10,
        poolSize: 'sdf',
        tls: { enabled: true },
      }),
    );
  });

  await t.step('SQLite', () => {
    assertEquals(
      true,
      assertSQLiteOptions({
        dialect: 'SQLITE',
        mode: 'FILE',
        path: 'some-path',
      }),
    );
    assertEquals(
      true,
      assertSQLiteOptions({ dialect: 'SQLITE', mode: 'MEMORY' }),
    );
  });
});
