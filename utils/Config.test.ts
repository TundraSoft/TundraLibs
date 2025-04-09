import * as asserts from '$asserts';
import {
  assertLoadConfigOptions,
  Config,
  loadConfig,
  type LoadConfigOptions,
} from './Config.ts';

Deno.test('utils.Config', async (t) => {
  await t.step('Config type inference', () => {
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

  await t.step('assert loadConfigOptions', () => {
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

  await t.step('Config object', () => {
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
      asserts.assertEquals(
        value,
        key === 'name' ? 'test' : key === 'version' ? '1.0.0' : 8080,
      );
    });
  });

  await t.step('Config object - deep nesting and edge cases', () => {
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

  await t.step('loadConfig', async (l) => {
    await l.step('basic checks', async () => {
      const conf = await loadConfig({
        path: './utils/fixtures/config/valid',
        env: false,
      });
      asserts.assertArrayIncludes(conf.list(), [
        'json',
        'sample2',
        'sample3',
      ]);

      // Not found
      asserts.assertRejects(
        () => loadConfig({ path: './utils/fixtures/config/valid/invalid' }),
        Error,
        'Config path not found',
      );
    });

    await l.step('malformed config', () => {
      asserts.assertRejects(
        () =>
          loadConfig({
            path: './utils/fixtures/config/malformed',
            include: [/JSON/],
          }),
        Error,
        'Error parsing config file',
      );

      asserts.assertRejects(
        () =>
          loadConfig({
            path: './utils/fixtures/config/malformed',
            include: [/Toml/],
          }),
        Error,
        'Error parsing config file',
      );

      asserts.assertRejects(
        () =>
          loadConfig({
            path: './utils/fixtures/config/malformed',
            include: [/Yml/],
          }),
        Error,
        'Error parsing config file',
      );
    });

    await l.step('duplicate config', () => {
      asserts.assertRejects(
        () =>
          loadConfig({
            path: './utils/fixtures/config/duplicate',
          }),
        Error,
        'Duplicate config file',
      );
    });

    await l.step('file format tests', async () => {
      const conf = await loadConfig({
        path: './utils/fixtures/config/formats',
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

    await l.step('include/exclude patterns', async () => {
      // Test include pattern
      const includeConf = await loadConfig({
        path: './utils/fixtures/config/valid',
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
        path: './utils/fixtures/config/valid',
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

    await l.step('environment variable replacement', async () => {
      // Create a temporary .env file
      const envContent = `
        PORT=9000
        HOST=example.com
        DB_USER=testuser
        DB_PASS=testpass
      `;
      const envPath = './utils/fixtures/config/temp/.env';
      await Deno.mkdir('./utils/fixtures/config/temp', { recursive: true });
      await Deno.writeTextFile(envPath, envContent);

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
      const configPath = './utils/fixtures/config/temp/config.json';
      await Deno.writeTextFile(configPath, configContent);

      try {
        // Test with env file path
        const conf = await loadConfig({
          path: './utils/fixtures/config/temp',
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
        await Deno.remove('./utils/fixtures/config/temp', { recursive: true });
      }
    });
  });
});

Deno.test({
  name: 'utils.Config - No Permission',
  permissions: { read: false },
  sanitizeOps: false,
  fn: () => {
    asserts.assertRejects(
      () => loadConfig({ path: './utils/fixtures/config/valid/' }),
      Error,
      'Permission denied',
    );
  },
});
