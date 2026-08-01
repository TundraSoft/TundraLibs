import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { BlackholeHandler } from './BlackholeHandler.ts';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';

describe('slogger.handlers.blackholeHandler', () => {
  const makeLogObject = (
    level: SyslogSeverities,
    message: string,
    context: Record<string, unknown> = {},
  ): SlogObject => ({
    id: '1',
    appName: 'testApp',
    hostname: 'localhost',
    levelName: SyslogSeverities[level] as SyslogSeverity,
    level,
    context,
    message,
    date: new Date('2023-01-01T12:00:00Z'),
    isoDate: new Date('2023-01-01T12:00:00Z').toISOString(),
    timestamp: new Date('2023-01-01T12:00:00Z').getTime(),
  });

  it('constructor - valid options', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    asserts.assertEquals(handler.name, 'testHandler');
    asserts.assertEquals(handler.level, 5);
    asserts.assertEquals(handler.mode, 'blackhole');
  });

  it('constructor - invalid options', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new BlackholeHandler('testHandler', { level: 99 } as any),
      Error,
      'Invalid log level',
    );
  });

  it('handle - no-op', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    const logMessage = 'This message should be discarded';
    handler.handle(makeLogObject(5, logMessage));
    // No assertion needed, as the message is discarded
  });

  it('handle - lower severity', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    const logMessage = 'This message should be discarded';
    handler.handle(makeLogObject(4, logMessage));
    // No assertion needed, as the message is discarded
  });

  it('handle - higher severity', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    const logMessage = 'This message should be discarded';
    handler.handle(makeLogObject(6, logMessage));
    // No assertion needed, as the message is discarded
  });

  it('finalize - no-op', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    handler.finalize();
    // No assertion needed, as the finalize method is a no-op
  });

  it('init - no-op', () => {
    const handler = new BlackholeHandler('testHandler', {
      level: 5,
    });
    handler.init();
    // No assertion needed, as the init method is a no-op
  });

  it('constructor - empty name', () => {
    asserts.assertThrows(
      () => new BlackholeHandler('', { level: 5 }),
      Error,
      'Handler name must be a non-empty string with max length 30',
    );
  });

  it('constructor - long name', () => {
    asserts.assertThrows(
      () =>
        new BlackholeHandler(
          'a'.repeat(31),
          { level: 5 },
        ),
      Error,
      'Handler name must be a non-empty string with max length 30',
    );
  });

  it('constructor - invalid level', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new BlackholeHandler('testHandler', { level: -1 } as any),
      Error,
      'Invalid log level',
    );
  });

  it('constructor - invalid formatter', () => {
    asserts.assertThrows(
      () =>
        new BlackholeHandler('testHandler', {
          level: 5,
          // deno-lint-ignore no-explicit-any
          formatter: 'invalidFormatter' as any,
        }),
      Error,
      'Formatter must be a function',
    );
  });

  it('constructor - formatter error', () => {
    asserts.assertThrows(
      () =>
        new BlackholeHandler('testHandler', {
          level: 5,
          formatter: () => {
            throw new Error('Formatter error');
          },
        }),
      Error,
      'Error running formatter: Error: Formatter error',
    );
  });
});
