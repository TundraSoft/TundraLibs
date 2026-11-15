/**
 * @fileoverview Tests for the unknown application option check.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { unknownConfigKeys } from './configKeys.ts';

describe('rapid.utils.configKeys', () => {
  it('finds a misspelt key at any depth, and leaves the groups rapid does not own alone', () => {
    asserts.assertEquals(
      unknownConfigKeys({
        name: 'x',
        sever: { port: 1 },
        server: {
          port: 1,
          maxBodysize: 1,
          paging: { defaultSize: 5, maxsize: 9 },
          metrics: true,
          static: { '/public': { root: './public' } },
          tls: { certFile: 'a', keyFile: 'b' },
          api: { prefix: '/api', host: ['a'] },
        },
        ui: { compose: { maxParts: 2, timeOut: 1 } },
        logger: { handlers: [], anything: true },
      }),
      [
        'sever',
        'server.maxBodysize',
        'server.paging.maxsize',
        'server.api.host',
        'ui.compose.timeOut',
      ],
    );
    asserts.assertEquals(
      unknownConfigKeys({ server: { metrics: { request: true } } }),
      ['server.metrics.request'],
    );
  });

  it('DEVELOPMENT refuses an unknown option and names each; PRODUCTION serves and warns', async () => {
    const options = {
      name: 'keys',
      logger: { handlers: [] },
      shutdownTimout: 5,
      server: { maxBodysize: 10 },
    };
    const error = await asserts.assertRejects(
      () =>
        Application.initialize({ ...options, mode: 'DEVELOPMENT' } as never),
    );
    asserts.assertEquals(
      (error as { context: { details: unknown } }).context.details,
      { keys: ['shutdownTimout', 'server.maxBodysize'] },
    );

    const app = await Application.initialize(
      { ...options, mode: 'PRODUCTION' } as never,
    );
    const lines: string[] = [];
    (app.log as unknown as { warn: (message: string) => void }).warn = (
      message,
    ) => void lines.push(message);
    for (const path of ['/a', '/b']) {
      await (await app.fetch(new Request(`http://app${path}`))).body?.cancel();
    }
    asserts.assertEquals(app.option('server')?.maxBodySize, 1_048_576);
    asserts.assertEquals(lines.length, 1);
    asserts.assertStringIncludes(lines[0]!, 'shutdownTimout');
    asserts.assertStringIncludes(lines[0]!, 'server.maxBodysize');
  });
});
