import { assertDialect } from './Dialect.ts';
import type {
  ClientOptions,
  MariaOptions,
  MongoOptions,
  PostgresOptions,
  SQLiteOptions,
} from '../types/mod.ts';

export const assertClientOptions = (x: unknown): x is ClientOptions => {
  return typeof x === 'object' &&
    x !== null &&
    'dialect' in x &&
    typeof x.dialect === 'string' &&
    assertDialect(x.dialect) &&
    (!('slowQueryThreshold' in x) ||
      typeof x.slowQueryThreshold === 'number' && x.slowQueryThreshold > 0);
};

const assertTLS = (
  x: unknown,
): x is { enabled: boolean; certificates?: string[]; verify?: boolean } => {
  return typeof x === 'object' &&
    x !== null &&
    'enabled' in x &&
    typeof x.enabled === 'boolean' &&
    (!('certificates' in x) ||
      (Array.isArray(x.certificates) &&
        x.certificates.every((c) => typeof c === 'string'))) &&
    (!('verify' in x) || typeof x.verify === 'boolean');
};

export const assertMariaOptions = (x: unknown): x is MariaOptions => {
  return assertClientOptions(x) &&
    (x.dialect === 'MARIA') &&
    ('host' in x && typeof x.host === 'string' && x.host.length > 0) && // Host is required
    (!('port' in x) ||
      (typeof x.port === 'number' && (x.port > 1 && x.port <= 65535))) && // Port is optional but if specified must be betwen 1 and 65535
    ('username' in x && typeof x.username === 'string' &&
      x.username.length > 0) && // Username is required
    ('password' in x && typeof x.password === 'string' &&
      x.password.length > 0) && // Password is required
    ('database' in x && typeof x.database === 'string' &&
      x.database.length > 0) && // Database name is required
    (!('connectionTimeout' in x) ||
      (typeof x.connectionTimeout === 'number' && x.connectionTimeout > 0 &&
        x.connectionTimeout <= 30)) && // Connection timeout is in seconds
    (!('idleTimeout' in x) ||
      (typeof x.idleTimeout === 'number' && x.idleTimeout > 0)) && // Idle timeout is in seconds
    (!('poolSize' in x) ||
      (typeof x.poolSize === 'number' && x.poolSize > 0)) && // Pool size is the number of connections to keep open. Min 1
    (!('tls' in x) ||
      assertTLS(x.tls)); // TLS is optional but if specified must be an object with enabled boolean
};

export const assertMongoOptions = (x: unknown): x is MongoOptions => {
  return assertClientOptions(x) &&
    (x.dialect === 'MONGO') &&
    ('host' in x && typeof x.host === 'string' && x.host.length > 0) && // Host is required
    (!('port' in x) ||
      (typeof x.port === 'number' && x.port > 0 && x.port < 65536)) && // Port is optional but if specified must be betwen 1 and 65535
    (!('username' in x) ||
      (typeof x.username === 'string' && x.username.length > 0)) && // Username is optional
    (!('password' in x) ||
      (typeof x.password === 'string' && x.password.length > 0)) && // Password is optional
    (!('authMechanism' in x) ||
      ['SCRAM-SHA-1', 'SCRAM-SHA-256', 'MONGODB-X509'].includes(
        (x as { authMechanism: string }).authMechanism,
      )) && // Auth mechanism is optional but if specified must be one of the three
    (!('authDb' in x) ||
      (typeof x.authDb === 'string' && x.authDb.length > 0)) && // Auth database is optional
    ('database' in x && typeof x.database === 'string' &&
      x.database.length > 0) && // Database name is required
    (!('connectionTimeout' in x) ||
      (typeof x.connectionTimeout === 'number' && x.connectionTimeout > 0 &&
        x.connectionTimeout <= 30)) && // Connection timeout is in seconds
    (!('idleTimeout' in x) ||
      (typeof x.idleTimeout === 'number' && x.idleTimeout > 0)) && // Idle timeout is in seconds
    (!('poolSize' in x) ||
      (typeof x.poolSize === 'number' && x.poolSize > 0)) && // Pool size is the number of connections to keep open. Min 1
    (!('tls' in x) ||
      assertTLS(x.tls)); // TLS is optional but if specified must be an object with enabled boolean
};

export const assertPostgresOptions = (x: unknown): x is PostgresOptions => {
  return assertClientOptions(x) &&
    (x.dialect === 'POSTGRES') &&
    ('host' in x && typeof x.host === 'string' && x.host.length > 0) && // Host is required
    (!('port' in x) ||
      (typeof x.port === 'number' && x.port > 0 && x.port < 65536)) && // Port is optional but if specified must be betwen 1 and 65535
    ('username' in x && typeof x.username === 'string' &&
      x.username.length > 0) && // Username is required
    ('password' in x && typeof x.password === 'string' &&
      x.password.length > 0) && // Password is required
    ('database' in x && typeof x.database === 'string' &&
      x.database.length > 0) && // Database name is required
    (!('connectionTimeout' in x) ||
      (typeof x.connectionTimeout === 'number' && x.connectionTimeout > 0 &&
        x.connectionTimeout <= 30)) && // Connection timeout is in seconds
    (!('poolSize' in x) ||
      (typeof x.poolSize === 'number' && x.poolSize > 0)) && // Pool size is the number of connections to keep open. Min 1
    (!('tls' in x) ||
      assertTLS(x.tls)); // TLS is optional but if specified must be an object with enabled boolean
};

export const assertSQLiteOptions = (x: unknown): x is SQLiteOptions => {
  return assertClientOptions(x) &&
    (x.dialect === 'SQLITE') &&
    ('mode' in x) &&
    (x.mode === 'MEMORY' || (x.mode === 'FILE' &&
      ('path' in x && typeof x.path === 'string' && x.path.length > 0))); // Filename is required only for FILE mode
};
