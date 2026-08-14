import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  FileAccessDenied,
  FileNotFound,
  makeDir,
  remove,
  writeTextFile,
} from '@tundralibs/compat';
import {
  assertLoadConfigOptions,
  Config,
  loadConfig,
  type LoadConfigOptions,
} from './Config.ts';

describe('utils.Config', () => {
  it('Config type inference', () => {
    type TestConfig = {
      app: {
        name: string;
        version: string;
      };
      settings: {
        debug: boolean;
        maxConnections: number;
      };
    };

    // Create a config with specific interface
    const typedConfig = Config<TestConfig>({
      app: {
        name: 'Test App',
        version: '1.0.0',
      },
      settings: {
        debug: true,
        maxConnections: 100,
      },
    });

    // These should have the correct types inferred
    const appName: string = typedConfig.get('app.name');
    const debug: boolean = typedConfig.get('settings.debug');
    const maxConn: number = typedConfig.get('settings.maxConnections');

    asserts.assertEquals(appName, 'Test App');
    asserts.assertEquals(debug, true);
    asserts.assertEquals(maxConn, 100);
  });

  it('assert loadConfigOptions', () => {
    asserts.assertThrows(
      () => assertLoadConfigOptions({} as unknown as LoadConfigOptions),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions({ path: 324 } as unknown as LoadConfigOptions),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions(
          { path: '/path', env: 324 } as unknown as LoadConfigOptions,
        ),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions(
          { path: '/path', include: 'adf' } as unknown as LoadConfigOptions,
        ),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions(
          { path: '/path', include: ['adf'] } as unknown as LoadConfigOptions,
        ),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions(
          { path: '/path', exclude: 'adf' } as unknown as LoadConfigOptions,
        ),
    );
    asserts.assertThrows(
      () =>
        assertLoadConfigOptions(
          { path: '/path', exclude: ['adf'] } as unknown as LoadConfigOptions,
        ),
    );
  });

  it('Config object', () => {
    const config = Config({
      application: {
        name: 'test',
        version: '1.0.0',
        port: 8080,
      },
      logging: {
        path: '/var/log/app.log',
        level: 'info',
      },
    });
    asserts.assertEquals(config.get('application.name'), 'test');
    asserts.assertEquals(config.get('application.port'), 8080);
    asserts.assertThrows(
      () => config.get('application.ports'),
      Error,
      'Config item "ports" does not exist in set "application',
    );
    asserts.assertThrows(
      () => config.get('applicationd' as 'application.ports'),
      Error,
      'Config set "applicationd" does not exist',
    );
    asserts.assertEquals(config.has('application.port'), true);
    asserts.assertEquals(config.has('application.ports'), false);
    asserts.assertEquals(config.has('sdf'), false);

    asserts.assertEquals(config.list(), ['application', 'logging']);
    asserts.assertEquals(
      config.keys('application'),
      ['name', 'version', 'port'],
    );
    asserts.assertEquals(
      config.keys('logging'),
      ['path', 'level'],
    );
    config.forEach('application', (key, value) => {
      const expectedValues: Record<string, string | number> = {
        'name': 'test',
        'version': '1.0.0',
        'port': 8080,
      };
      asserts.assertEquals(value, expectedValues[key]);
    });
  });

  it('Config object - get with a default value', () => {
    const config = Config({
      server: {
        port: 8080,
        host: '',
        debug: false,
        retries: 0,
        replica: null,
        label: undefined,
        tls: {
          enabled: true,
        },
      },
    });

    // A path that resolves ignores the default entirely — including when
    // the stored value is falsy.
    asserts.assertEquals(config.get('server.port', 3000), 8080);
    asserts.assertEquals(config.get('server.host', '0.0.0.0'), '');
    asserts.assertEquals(config.get('server.debug', true), false);
    asserts.assertEquals(config.get('server.retries', 5), 0);
    asserts.assertEquals(config.get('server.tls.enabled', false), true);

    // Missing set, missing key, and missing nested key all yield the default.
    asserts.assertEquals(config.get('nosuchset.port', 3000), 3000);
    asserts.assertEquals(config.get('server.workers', 4), 4);
    asserts.assertEquals(config.get('server.tls.cert', '/tls.pem'), '/tls.pem');

    // So do the paths that would otherwise raise a raw TypeError: a `null`
    // intermediate, and traversal into a primitive.
    asserts.assertEquals(
      config.get('server.replica.host', 'localhost'),
      'localhost',
    );
    asserts.assertEquals(config.get('server.port.value', 1), 1);

    // `null` is a value the config author wrote down: it is returned as-is.
    asserts.assertEquals(config.get('server.replica', 'fallback'), null);

    // A key holding `undefined` is what `has()` calls missing, so the
    // default applies — keeping `get(p, d)` equal to `has(p) ? get(p) : d`.
    asserts.assertEquals(config.has('server.label'), false);
    asserts.assertEquals(config.get('server.label', 'unnamed'), 'unnamed');
    asserts.assertEquals(config.has('server.replica'), true);

    // Without a default the behaviour is unchanged — missing paths throw.
    asserts.assertThrows(
      () => config.get('server.workers'),
      Error,
      'Config item "workers" does not exist in set "server"',
    );
    asserts.assertThrows(
      () => config.get('nosuchset.port'),
      Error,
      'Config set "nosuchset" does not exist',
    );
    asserts.assertThrows(
      () => config.get('server.replica.host'),
      Error,
      'Config item "replica.host" does not exist in set "server"',
    );
    // …and a present-but-undefined key still hands back the `undefined`.
    asserts.assertEquals(config.get('server.label'), undefined);

    // The default must not widen the result type to `T | undefined`:
    // these assignments would not compile if it did.
    const port: number = config.get('server.port', 3000);
    const workers: number = config.get('server.workers', 4);
    const explicit: string = config.get<string>('server.name', 'api');
    asserts.assertEquals(port, 8080);
    asserts.assertEquals(workers, 4);
    asserts.assertEquals(explicit, 'api');
  });

  it('Config object - deep nesting and edge cases', () => {
    const config = Config({
      server: {
        http: {
          port: 8080,
          host: 'localhost',
          options: {
            timeout: 30000,
            keepAlive: true,
            headers: {
              'content-type': 'application/json',
            },
          },
        },
        https: {
          enabled: true,
          port: 8443,
          certificates: {
            key: '/path/to/key',
            cert: '/path/to/cert',
          },
        },
        empty: {},
      },
      database: {
        type: 'postgres',
        connection: {
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'secret',
          database: 'mydb',
        },
      },
      empty: {},
    });

    // Deep nesting tests
    asserts.assertEquals(config.get<number>('server.http.port'), 8080);
    asserts.assertEquals(
      config.get<string>(
        'server.http.options.headers.content-type',
      ),
      'application/json',
    );
    asserts.assertEquals(
      config.get<boolean>('server.https.enabled'),
      true,
    );
    asserts.assertEquals(
      config.get<string>('server.https.certificates.key'),
      '/path/to/key',
    );

    // Edge case: empty object
    asserts.assertEquals(config.keys('server').length, 3);
    asserts.assertEquals(config.keys('empty').length, 0);

    // Deep path existence
    asserts.assertEquals(
      config.has('server.http.options.timeout'),
      true,
    );
    asserts.assertEquals(
      config.has('server.http.options.nonexistent'),
      false,
    );
    asserts.assertEquals(
      config.has('server.http.nonexistent.property'),
      false,
    );

    // Edge cases for forEach
    let count = 0;
    config.forEach('empty', () => {
      count++;
    });
    asserts.assertEquals(
      count,
      0,
      "forEach shouldn't call callback for empty objects",
    );

    // Verify keys at different levels
    asserts.assertEquals(config.keys('server'), ['http', 'https', 'empty']);
    asserts.assertEquals(config.keys('database'), ['type', 'connection']);
  });

  describe('loadConfig', () => {
    it('basic checks', async () => {
      const conf = await loadConfig({
        path: 'packages/utils/fixtures/config/valid',
        env: false,
      });
      asserts.assertArrayIncludes(conf.list(), [
        'json',
        'sample2',
        'sample3',
      ]);

      // Not found
      await asserts.assertRejects(
        async () =>
          await loadConfig({
            path: 'packages/utils/fixtures/config/valid/invalid',
          }),
        FileNotFound,
      );
    });

    it('malformed config', async () => {
      await asserts.assertRejects(
        () =>
          loadConfig({
            path: 'packages/utils/fixtures/config/malformed',
            include: [/JSON/],
          }),
        Error,
        'Error parsing config file',
      );

      await asserts.assertRejects(
        () =>
          loadConfig({
            path: 'packages/utils/fixtures/config/malformed',
            include: [/Toml/],
          }),
        Error,
        'Error parsing config file',
      );

      await asserts.assertRejects(
        () =>
          loadConfig({
            path: 'packages/utils/fixtures/config/malformed',
            include: [/Yml/],
          }),
        Error,
        'Error parsing config file',
      );
    });

    it('duplicate config', async () => {
      await asserts.assertRejects(
        () =>
          loadConfig({
            path: 'packages/utils/fixtures/config/duplicate',
          }),
        Error,
        'Duplicate config file',
      );
    });

    it('file format tests', async () => {
      const conf = await loadConfig({
        path: 'packages/utils/fixtures/config/formats',
      });

      // Test JSON file
      asserts.assertEquals(conf.has('json_config'), true);
      asserts.assertEquals(
        conf.get<string>('json_config.name'),
        'JSON Config',
      );

      // Test YAML file
      asserts.assertEquals(conf.has('yaml_config'), true);
      asserts.assertEquals(
        conf.get<string>('yaml_config.name'),
        'YAML Config',
      );

      // Test TOML file
      asserts.assertEquals(conf.has('toml_config'), true);
      asserts.assertEquals(
        conf.get<string>('toml_config.name'),
        'TOML Config',
      );
    });

    it('include/exclude patterns', async () => {
      // Test include pattern
      const includeConf = await loadConfig({
        path: 'packages/utils/fixtures/config/valid',
        include: [/sample/],
      });
      asserts.assertEquals(
        includeConf.has('json'),
        false,
        "Should not include files that don't match pattern",
      );
      asserts.assertEquals(includeConf.has('sample2'), true);
      asserts.assertEquals(includeConf.has('sample3'), true);

      // Test exclude pattern
      const excludeConf = await loadConfig({
        path: 'packages/utils/fixtures/config/valid',
        exclude: [/sample/],
      });
      asserts.assertEquals(excludeConf.has('json'), true);
      asserts.assertEquals(
        excludeConf.has('sample2'),
        false,
        'Should exclude files that match pattern',
      );
      asserts.assertEquals(
        excludeConf.has('sample3'),
        false,
        'Should exclude files that match pattern',
      );
    });

    it('environment variable replacement', async () => {
      // Create a temporary .env file
      const envContent = `
        PORT=9000
        HOST=example.com
        DB_USER=testuser
        DB_PASS=testpass
      `;
      const envPath = 'packages/utils/fixtures/config/temp/.env';
      await makeDir('packages/utils/fixtures/config/temp', { recursive: true });
      await writeTextFile(envPath, envContent);

      // Create a temporary config with variables
      const configContent = `{
        "name": "Test App",
        "server": {
          "port": $\{PORT},
          "host": "$\{HOST}"
        },
        "database": {
          "user": "$\{DB_USER}",
          "password": "$\{DB_PASS}"
        }
      }`;
      const configPath = 'packages/utils/fixtures/config/temp/config.json';
      await writeTextFile(configPath, configContent);

      try {
        // Test with env file path
        const conf = await loadConfig({
          path: 'packages/utils/fixtures/config/temp',
          env: envPath,
        });

        asserts.assertEquals(
          conf.get<number>('config.server.port'),
          9000,
        );
        asserts.assertEquals(
          conf.get<string>('config.server.host'),
          'example.com',
        );
        asserts.assertEquals(
          conf.get<string>('config.database.user'),
          'testuser',
        );
        asserts.assertEquals(
          conf.get<string>('config.database.password'),
          'testpass',
        );
      } finally {
        // Clean up
        await remove('packages/utils/fixtures/config/temp');
      }
    });
  });
});

describe('utils.Config round-3 regressions', () => {
  // Exactly what @std/yaml produces for an empty `replica:` key.
  const cfg = Config({ database: { host: 'db1', replica: null } });

  it('#5 - has() returns false (never throws) through a null intermediate', () => {
    asserts.assertEquals(cfg.has('database.replica.host'), false);
    asserts.assertEquals(cfg.has('database.replica'), true);
  });

  it('#5 - has() does not index into string characters', () => {
    asserts.assertEquals(cfg.has('database.host.0'), false);
  });

  it('#5 - get() throws the friendly error through a null intermediate', () => {
    asserts.assertThrows(
      () => cfg.get('database.replica.host'),
      Error,
      'Config item "replica.host" does not exist in set "database"',
    );
  });

  it('#5 - get() does not return string character indices', () => {
    asserts.assertThrows(
      () => cfg.get('database.host.0'),
      Error,
      'Config item "host.0" does not exist in set "database"',
    );
  });
});

describe({
  name: 'utils.Config - No Permission',
  permissions: { read: false },
  deno: true,
  bun: false,
  node: false,
  // sanitizeOps: false,
  fn: () => {
    it('loadConfig - No Read Permission', async () => {
      asserts.assertRejects(
        async () =>
          await loadConfig({ path: 'packages/utils/fixtures/config/valid/' }),
        FileAccessDenied,
      );
    });
  },
});
