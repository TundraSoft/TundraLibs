import { AbstractHandler, type HandlerOptions } from './AbstractHandler.ts';
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../types/mod.ts';
import { simpleFormatter } from '../formatters/string.ts';
import { SloggerConfigError } from '../errors/mod.ts';

// Concrete implementation of AbstractHandler for testing
class TestHandler extends AbstractHandler {
  public readonly mode = 'test';
  public handledMessages: string[] = [];
  public throwOnHandle = false;
  public handleCalled = false; // Add property initialization

  constructor(name: string, options: HandlerOptions) {
    super(name, options);
  }

  protected _handle(message: string): Promise<void> | void {
    this.handleCalled = true; // Set to true when _handle is called
    if (this.throwOnHandle) {
      throw new Error('Test error in _handle');
    }
    this.handledMessages.push(message);
  }

  // Expose protected method for testing
  public format(log: SlogObject): string {
    return this._format(log);
  }

  // Override methods to track calls
  public override async init(): Promise<void> {
    this.handledMessages.push('init called');
    await super.init();
  }

  public override async finalize(): Promise<void> {
    this.handledMessages.push('finalize called');
    await super.finalize();
  }
}

// Helper to create a standard log object for testing
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

describe('slogger.handlers.abstractHandler', () => {
  it('constructor - valid options', () => {
    const handler = new TestHandler('testHandler', {
      level: 5,
    });

    asserts.assertEquals(handler.name, 'testHandler');
    asserts.assertEquals(handler.level, 5);
    asserts.assertEquals(handler.mode, 'test');
  });

  describe('constructor - name validation', () => {
    it('rejects empty name', () => {
      asserts.assertThrows(
        () => new TestHandler('', { level: 5 }),
        SloggerConfigError,
        'Handler name must be a non-empty string',
      );
    });

    it('rejects name exceeding max length', () => {
      asserts.assertThrows(
        () => new TestHandler('a'.repeat(31), { level: 5 }),
        Error,
        'Handler name must be a non-empty string',
      );
    });

    it('trims name', () => {
      const handler = new TestHandler('  testHandler  ', { level: 5 });
      asserts.assertEquals(handler.name, 'testHandler');
    });
  });

  describe('constructor - level validation', () => {
    it('rejects negative level', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new TestHandler('testHandler', { level: -1 } as any),
        Error,
        'Invalid log level',
      );
    });

    it('rejects level above 7', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new TestHandler('testHandler', { level: 8 } as any),
        Error,
        'Invalid log level',
      );
    });

    it('rejects non-numeric level', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new TestHandler('testHandler', { level: 'ERROR' } as any),
        Error,
        'Invalid log level',
      );
    });
  });

  describe('constructor - formatter validation', () => {
    it('rejects non-function formatter', () => {
      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            // deno-lint-ignore no-explicit-any
            formatter: 'string' as any,
          }),
        SloggerConfigError,
        'Formatter must be a function',
      );
    });

    it('rejects formatter that returns non-string', () => {
      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            // deno-lint-ignore no-explicit-any
            formatter: () => 123 as any,
          }),
        Error,
        'Formatter must return a string',
      );
    });

    it('rejects formatter that throws', () => {
      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            formatter: () => {
              throw new Error('Test error');
            },
          }),
        Error,
        'Error running formatter',
      );
    });

    it('accepts valid formatter', () => {
      const formatter = simpleFormatter('${message}');
      const handler = new TestHandler('testHandler', {
        level: 5,
        formatter,
      });
      asserts.assertEquals(handler.formatter, formatter);
    });
  });

  it('handle - respects log levels', async () => {
    const handler = new TestHandler('testHandler', {
      level: SyslogSeverities.WARNING, // Level 4
      formatter: simpleFormatter('${levelName}: ${message}'),
    });

    // This should be handled (level 3 < WARNING level 4)
    await handler.handle(
      makeLogObject(SyslogSeverities.ERROR, 'Error message'),
    );

    // This should be handled (level 4 = WARNING level 4)
    await handler.handle(
      makeLogObject(SyslogSeverities.WARNING, 'Warning message'),
    );

    // This should NOT be handled (level 6 > WARNING level 4)
    await handler.handle(makeLogObject(SyslogSeverities.INFO, 'Info message'));

    asserts.assertEquals(handler.handledMessages.length, 2);
    asserts.assert(handler.handledMessages[0]!.includes('Error message'));
    asserts.assert(handler.handledMessages[1]!.includes('Warning message'));
    asserts.assert(
      !handler.handledMessages.some((msg) => msg.includes('Info message')),
    );
  });

  it('format - uses provided formatter', () => {
    const handler = new TestHandler('testHandler', {
      level: 5,
      formatter: simpleFormatter('CUSTOM: ${message}'),
    });

    const log = makeLogObject(SyslogSeverities.INFO, 'Test message');
    const formatted = handler.format(log);

    asserts.assertEquals(formatted, 'CUSTOM: Test message');
  });

  it('lifecycle methods', async () => {
    const handler = new TestHandler('testHandler', { level: 5 });

    await handler.init();
    asserts.assertEquals(handler.handledMessages[0], 'init called');

    await handler.finalize();
    asserts.assertEquals(handler.handledMessages[1], 'finalize called');
  });

  it('handle - with throwing _handle', async () => {
    const handler = new TestHandler('testHandler', { level: 5 });
    handler.throwOnHandle = true;

    // Option 1: Use assertThrows instead of try/catch
    await asserts.assertRejects(
      async () => {
        await handler.handle(
          makeLogObject(SyslogSeverities.CRITICAL, 'Test message'),
        );
      },
      Error,
      'Test error in _handle',
    );
  });

  describe('sampling configuration validation', () => {
    it('accepts valid sampling options', () => {
      const handler = new TestHandler('testHandler', {
        level: 5,
        sampling: {
          sampleRate: 0.5, // 50% sampling
          bypassSamplingForLevel: SyslogSeverities.WARNING,
        },
      });

      // @ts-expect-error accessing protected properties
      asserts.assertEquals(handler._sampleRate, 0.5);
      asserts.assertEquals(
        // @ts-expect-error accessing protected properties
        handler._bypassSamplingLevel,
        SyslogSeverities.WARNING,
      );
    });

    it('rejects invalid sample rate', () => {
      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            sampling: {
              sampleRate: 1.5, // Should be 0-1
            },
          }),
        Error,
        'Sampling rate must be a number between 0 and 1',
      );

      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            sampling: {
              sampleRate: -0.5, // Should be 0-1
            },
          }),
        Error,
        'Sampling rate must be a number between 0 and 1',
      );
    });

    it('rejects invalid bypass level', () => {
      asserts.assertThrows(
        () =>
          new TestHandler('testHandler', {
            level: 5,
            sampling: {
              bypassSamplingForLevel: 8, // Should be 0-7
            },
          }),
        Error,
        'Bypass sampling level must be a valid log level',
      );
    });
  });

  it('sampling behavior', async () => {
    // Mock Math.random for deterministic testing — the sampling gate
    // draws from Math.random (statistical throughput control, not a
    // security decision, so no CSPRNG on the hot path).
    const originalRandom = Math.random;

    try {
      // Create a handler with 50% sampling
      const handler = new TestHandler('testHandler', {
        level: SyslogSeverities.DEBUG, // Accept all logs
        sampling: {
          sampleRate: 0.5, // 50% sample rate
          bypassSamplingForLevel: SyslogSeverities.ERROR, // Bypass for ERROR+
        },
      });

      // Test bypassing sampling for high-severity logs
      Math.random = () => 0.9;

      // Reset for clean test
      handler.handleCalled = false;

      // This is ERROR level and should bypass sampling regardless of Math.random
      await handler.handle(
        makeLogObject(SyslogSeverities.ERROR, 'Error message'),
      );
      asserts.assertEquals(handler.handleCalled, true);

      // Reset for next test
      handler.handleCalled = false;
      handler.handledMessages = [];

      // Test sampling out (random > sample rate)
      Math.random = () => 0.9;

      // This is INFO level and should be sampled out
      await handler.handle(
        makeLogObject(SyslogSeverities.INFO, 'Info message'),
      );
      asserts.assertEquals(handler.handleCalled, false);

      // Test sampling in (random < sample rate)
      Math.random = () => 0.3;

      // This is INFO level and should be sampled in
      await handler.handle(
        makeLogObject(SyslogSeverities.INFO, 'Info message'),
      );
      asserts.assertEquals(handler.handleCalled, true);
    } finally {
      Math.random = originalRandom;
    }
  });
});
