import * as asserts from '@std/asserts';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
} from '@tundralibs/compat/test';
import { hostname } from '@tundralibs/compat';
import { Slogger } from './Slogger.ts';
import { AbstractHandler } from './handlers/AbstractHandler.ts';
import { SyslogSeverities } from '@tundralibs/utils';
import { LogManager } from './LogManager.ts';
import { SlogObject } from './types/mod.ts';
import {
  SloggerConfigError,
  SloggerError,
  SloggerFinalizeError,
} from './errors/mod.ts';

// Increase max listeners for test environment to prevent warnings
if (typeof process !== 'undefined' && process.setMaxListeners) {
  process.setMaxListeners(20);
}

// Test implementation of AbstractHandler
class TestHandler extends AbstractHandler {
  public readonly mode = 'test';
  public messages: SlogObject[] = [];
  public handleCalled = false;
  public initCalled = false;
  public finalizeCalled = false;

  // deno-lint-ignore no-explicit-any
  constructor(name: string, options: any) {
    super(name, options);
  }

  public override async init(): Promise<void> {
    this.initCalled = true;
    await super.init();
  }

  public override async finalize(): Promise<void> {
    this.finalizeCalled = true;
    await super.finalize();
  }

  protected _handle(_message: string): void {
    this.handleCalled = true;
  }

  public override async handle(log: SlogObject): Promise<void> {
    await super.handle(log);
  }

  protected override _format(log: SlogObject): string {
    this.messages.push({ ...log });
    return super._format(log);
  }
}

// Register the test handler with LogManager
LogManager.addHandler('TestHandler', TestHandler);

describe('slogger.core', () => {
  it('constructor - valid options', () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [],
    });

    asserts.assertEquals(logger.appName, 'TestApp');
    asserts.assertEquals(logger.level, SyslogSeverities.INFO);
  });

  describe('constructor - validation', () => {
    it('invalid appName', () => {
      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'a'.repeat(31), // Too long
            level: SyslogSeverities.INFO,
            handlers: [],
          }),
        SloggerConfigError,
        'appName must be a non-empty string with max length 30',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            // @ts-expect-error Testing invalid type
            appName: 123,
            level: SyslogSeverities.INFO,
            handlers: [],
          }),
        Error,
        'appName must be a non-empty string',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            appName: '',
            level: SyslogSeverities.INFO,
            handlers: [],
          }),
        Error,
        'appName must be a non-empty string',
      );
    });

    it('invalid level', () => {
      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            // @ts-expect-error Testing invalid level
            level: -1,
            handlers: [],
          }),
        SloggerConfigError,
        'Invalid log level',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            // @ts-expect-error Testing invalid level
            level: 8,
            handlers: [],
          }),
        Error,
        'Invalid log level',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            // @ts-expect-error Testing invalid level
            level: 'INFO',
            handlers: [],
          }),
        Error,
        'Invalid log level',
      );
    });

    it('invalid handler options', () => {
      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            level: SyslogSeverities.INFO,
            handlers: [
              {
                name: 'handler1',
                type: 'TestHandler',
                level: SyslogSeverities.INFO,
                // @ts-expect-error Testing invalid formatter type
                formatter: 123,
              },
            ],
          }),
        SloggerConfigError,
        'must be a string or function',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            level: SyslogSeverities.INFO,
            handlers: [
              {
                name: 'handler1',
                type: 'TestHandler',
                level: SyslogSeverities.INFO,
                formatter: 'non-existent-formatter',
              },
            ],
          }),
        SloggerConfigError,
        'not found',
      );

      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            level: SyslogSeverities.INFO,
            handlers: [
              {
                name: 'handler1',
                type: 'NonExistentHandler',
                level: SyslogSeverities.INFO,
              },
            ],
          }),
        SloggerConfigError,
        'not found',
      );
    });

    it('handler-init failures carry the underlying error as cause', () => {
      const err = asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            level: SyslogSeverities.INFO,
            handlers: [
              {
                name: 'handler1',
                type: 'NonExistentHandler',
                level: SyslogSeverities.INFO,
              },
            ],
          }),
        SloggerConfigError,
        "Failed to initialize handler 'handler1'",
      );
      // Typed hierarchy: config errors are SloggerErrors are Errors.
      asserts.assert(err instanceof SloggerError);
      asserts.assert(err.cause instanceof SloggerConfigError);
      asserts.assert(
        (err.cause as SloggerConfigError).message.includes('not found'),
      );
    });
  });

  describe(
    'constructor - validation with new configuration format',
    () => {
      it('invalid handler options', () => {
        asserts.assertThrows(
          () =>
            new Slogger({
              appName: 'TestApp',
              level: SyslogSeverities.INFO,
              handlers: [
                {
                  name: 'handler1',
                  type: 'TestHandler',
                  level: SyslogSeverities.INFO,
                  // @ts-expect-error Testing invalid formatter type
                  formatter: 123,
                },
              ],
            }),
          Error,
          'must be a string or function',
        );

        asserts.assertThrows(
          () =>
            new Slogger({
              appName: 'TestApp',
              level: SyslogSeverities.INFO,
              handlers: [
                {
                  name: 'handler1',
                  type: 'TestHandler',
                  level: SyslogSeverities.INFO,
                  formatter: 'non-existent-formatter',
                },
              ],
            }),
          Error,
          'not found',
        );

        asserts.assertThrows(
          () =>
            new Slogger({
              appName: 'TestApp',
              level: SyslogSeverities.INFO,
              handlers: [
                {
                  name: 'handler1',
                  type: 'NonExistentHandler',
                  level: SyslogSeverities.INFO,
                },
              ],
            }),
          Error,
          'not found',
        );
      });
    },
  );

  it('handler initialization', () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handlers = logger._handlers;
    asserts.assertEquals(handlers.length, 1);
    asserts.assert(handlers[0] instanceof TestHandler);
    asserts.assertEquals(handlers[0].name, 'handler1');
    asserts.assertEquals(handlers[0].level, SyslogSeverities.INFO);

    // Verify init was called
    asserts.assertEquals(handlers[0].initCalled, true);
  });

  it('handler initialization with new configuration format', () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
          formatter: 'standard',
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handlers = logger._handlers;
    asserts.assertEquals(handlers.length, 1);
    asserts.assert(handlers[0] instanceof TestHandler);
    asserts.assertEquals(handlers[0].name, 'handler1');
    asserts.assertEquals(handlers[0].level, SyslogSeverities.INFO);

    // Verify init was called
    asserts.assertEquals(handlers[0].initCalled, true);
  });

  it('log level filtering', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.WARNING, // Only WARNING and higher priority
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO, // Handler accepts INFO and higher
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;

    // This should pass logger's filter but be handled by the handler (INFO > WARNING)
    logger.info('This should be filtered by logger');
    asserts.assertEquals(handler.messages.length, 0);

    // This should pass both filters (WARNING = WARNING)
    logger.warning('This should be logged');
    asserts.assertEquals(handler.messages.length, 1);
    asserts.assertEquals(handler.messages[0]!.message, 'This should be logged');
    asserts.assertEquals(handler.messages[0]!.levelName, 'WARNING');

    // This should pass both filters (ERROR > WARNING)
    logger.error('Error message');
    asserts.assertEquals(handler.messages.length, 2);
    asserts.assertEquals(handler.messages[1]!.message, 'Error message');
    asserts.assertEquals(handler.messages[1]!.levelName, 'ERROR');

    // Reset handler
    handler.messages = [];

    // Test handler-level filtering
    const logger2 = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.DEBUG, // Accept all logs
      handlers: [
        {
          name: 'handler2',
          type: 'TestHandler',
          level: SyslogSeverities.ERROR, // Only ERROR and lower
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler2 = logger2._handlers[0] as TestHandler;

    // This should pass logger's filter but be filtered by handler
    logger2.info('This should be filtered by handler');
    asserts.assertEquals(handler2.messages.length, 0);

    // This should pass logger's filter but be filtered by handler
    logger2.warning('This should be filtered by handler');
    asserts.assertEquals(handler2.messages.length, 0);

    // This should pass both filters
    logger2.error('This should be logged');
    asserts.assertEquals(handler2.messages.length, 1);
    asserts.assertEquals(
      handler2.messages[0]!.message,
      'This should be logged',
    );
  });

  it('convenience methods', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.DEBUG, // Accept all logs
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.DEBUG,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;
    handler.messages = [];

    // Test all convenience methods
    logger.debug('Debug message');
    logger.info('Info message');
    logger.information('Information message'); // Alias
    logger.notice('Notice message');
    logger.warn('Warning message');
    logger.warning('Warning message'); // Alias
    logger.err('Error message');
    logger.error('Error message'); // Alias
    logger.crit('Critical message');
    logger.critical('Critical message'); // Alias
    logger.alert('Alert message');
    logger.emerg('Emergency message');
    logger.emergency('Emergency message'); // Alias

    asserts.assertEquals(handler.messages.length, 13);
    asserts.assertEquals(handler.messages[0]!.levelName, 'DEBUG');
    asserts.assertEquals(handler.messages[1]!.levelName, 'INFO');
    asserts.assertEquals(handler.messages[2]!.levelName, 'INFO');
    asserts.assertEquals(handler.messages[3]!.levelName, 'NOTICE');
    asserts.assertEquals(handler.messages[4]!.levelName, 'WARNING');
    asserts.assertEquals(handler.messages[5]!.levelName, 'WARNING');
    asserts.assertEquals(handler.messages[6]!.levelName, 'ERROR');
    asserts.assertEquals(handler.messages[7]!.levelName, 'ERROR');
    asserts.assertEquals(handler.messages[8]!.levelName, 'CRITICAL');
    asserts.assertEquals(handler.messages[9]!.levelName, 'CRITICAL');
    asserts.assertEquals(handler.messages[10]!.levelName, 'ALERT');
    asserts.assertEquals(handler.messages[11]!.levelName, 'EMERGENCY');
    asserts.assertEquals(handler.messages[12]!.levelName, 'EMERGENCY');
  });

  it('context variables (interpolation opt-in)', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      interpolateMessage: true,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;
    handler.messages = [];

    // Test with context variables
    const context = {
      userId: 123,
      action: 'login',
      timestamp: new Date().toISOString(),
    };

    logger.info(
      'User ${userId} performed ${action} at ${timestamp}',
      context,
    );

    asserts.assertEquals(handler.messages.length, 1);
    asserts.assert(
      handler.messages[0]!.message.includes('User 123 performed login at'),
    );
    asserts.assertEquals(handler.messages[0]!.context, context);
  });

  it('does NOT interpolate the message by default (log-injection guard)', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      // interpolateMessage omitted → defaults to false
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;
    handler.messages = [];

    // A `${...}` placeholder in an (attacker-controlled) message must
    // stay literal and never resolve against the context, even when the
    // context carries the named field.
    logger.info('${secret}', { secret: 'x' });
    logger.info('hello ${user.password} world', {
      user: { password: 'hunter2' },
    });

    asserts.assertEquals(handler.messages.length, 2);
    // Message is emitted verbatim — no substitution.
    asserts.assertEquals(handler.messages[0]!.message, '${secret}');
    asserts.assertEquals(
      handler.messages[1]!.message,
      'hello ${user.password} world',
    );
    // The secret must not have leaked into the rendered message.
    asserts.assert(!handler.messages[0]!.message.includes('x'));
    asserts.assert(!handler.messages[1]!.message.includes('hunter2'));
    // Structured context is still passed through untouched.
    asserts.assertEquals(handler.messages[0]!.context, { secret: 'x' });
  });

  it('rejects prototype-chain probing even when interpolation is enabled', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      interpolateMessage: true,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;
    handler.messages = [];

    // Inherited members / prototype-chain paths must not resolve; the
    // placeholders are kept literal (onMissing: 'literal' contract).
    logger.info('${constructor} ${__proto__.x} ${user.constructor.name}', {
      user: { name: 'Ada' },
    });

    asserts.assertEquals(handler.messages.length, 1);
    asserts.assertEquals(
      handler.messages[0]!.message,
      '${constructor} ${__proto__.x} ${user.constructor.name}',
    );
  });

  it('log message generation', async () => {
    // Create a fixed date for testing
    const testISOString = '2023-01-01T12:00:00.000Z';
    const testTimestamp = 1672574400000;

    // Use proper spies for Date methods
    const originalDateNow = Date.now;
    const originalToISOString = Date.prototype.toISOString;
    const originalGetTime = Date.prototype.getTime;

    // Replace Date.now and Date prototype methods with spies that return fixed values
    Date.now = () => testTimestamp;
    Date.prototype.toISOString = () => testISOString;
    Date.prototype.getTime = () => testTimestamp;

    try {
      const logger = new Slogger({
        appName: 'TestApp',
        level: SyslogSeverities.INFO,
        handlers: [
          {
            name: 'handler1',
            type: 'TestHandler',
            level: SyslogSeverities.INFO,
          },
        ],
      });

      // @ts-expect-error Accessing protected property for testing
      const handler = logger._handlers[0] as TestHandler;
      handler.messages = [];

      logger.info('Test message');

      asserts.assertEquals(handler.messages.length, 1);
      const log = handler.messages[0]!;

      // Verify all log fields
      asserts.assert(typeof log.id === 'string');
      asserts.assertEquals(log.appName, 'TestApp');
      asserts.assertEquals(log.hostname, hostname());
      asserts.assertEquals(log.level, SyslogSeverities.INFO);
      asserts.assertEquals(log.levelName, 'INFO');
      asserts.assertEquals(log.message, 'Test message');

      // These should match our fixed test values
      asserts.assertEquals(log.isoDate, testISOString);
      asserts.assertEquals(log.timestamp, testTimestamp);
      asserts.assertEquals(log.context, {});
    } finally {
      // Restore original methods
      Date.now = originalDateNow;
      Date.prototype.toISOString = originalToISOString;
      Date.prototype.getTime = originalGetTime;
    }
  });

  it('handler registration', () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [],
    });

    // @ts-expect-error Accessing protected property for testing
    asserts.assertEquals(logger._handlers.length, 0);

    const handler = new TestHandler('custom', {
      level: SyslogSeverities.DEBUG,
    });
    logger.registerHandler(handler);

    // @ts-expect-error Accessing protected property for testing
    asserts.assertEquals(logger._handlers.length, 1);
    // @ts-expect-error Accessing protected property for testing
    asserts.assertEquals(logger._handlers[0], handler);

    // Test invalid handler
    asserts.assertThrows(
      // @ts-expect-error Testing invalid handler
      () => logger.registerHandler({}),
      SloggerConfigError,
      'Handler must be an instance of AbstractHandler',
    );
  });

  it('finalization', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // @ts-expect-error Accessing protected property for testing
    const handler = logger._handlers[0] as TestHandler;
    asserts.assertEquals(handler.finalizeCalled, false);

    // Manually call finalize (normally would be triggered by exit event)
    await logger.finalize();

    asserts.assertEquals(handler.finalizeCalled, true);
  });

  describe('finalize() — per-handler isolation', () => {
    // Regression for the review's HIGH finding: finalize() used to
    // abort at the first handler that rejected, so later handlers
    // never flushed their buffers or released their resources.

    class RejectingHandler extends TestHandler {
      public override async finalize(): Promise<void> {
        await super.finalize(); // record the attempt
        throw new Error(`${this.name} endpoint is down`);
      }
    }

    class BufferingHandler extends TestHandler {
      public buffered: string[] = ['queued-entry'];
      public flushed: string[] = [];
      public override async finalize(): Promise<void> {
        // Simulates a FileHandler-style flush-and-close.
        this.flushed.push(...this.buffered);
        this.buffered = [];
        await super.finalize();
      }
    }

    it('runs EVERY handler even when an earlier one rejects, then surfaces the failure', async () => {
      const logger = new Slogger({
        appName: 'FinalizeApp',
        level: SyslogSeverities.INFO,
        handlers: [],
      });
      const failing = new RejectingHandler('http-down', {
        level: SyslogSeverities.INFO,
      });
      const buffering = new BufferingHandler('file-ok', {
        level: SyslogSeverities.INFO,
      });
      logger.registerHandler(failing);
      logger.registerHandler(buffering);

      const err = await asserts.assertRejects(
        () => logger.finalize(),
        SloggerFinalizeError,
        "finalize() failed for 1 handler(s): 'http-down'",
      );

      // The second handler's finalize DID run and its buffer flushed.
      asserts.assertEquals(buffering.finalizeCalled, true);
      asserts.assertEquals(buffering.flushed, ['queued-entry']);
      asserts.assertEquals(buffering.buffered, []);

      // The failure detail is preserved for the caller.
      asserts.assertEquals(err.failures.length, 1);
      asserts.assertEquals(err.failures[0]!.handler, 'http-down');
      asserts.assert(err.failures[0]!.error instanceof Error);
      asserts.assert(err.cause instanceof Error);
      asserts.assertEquals(
        (err.cause as Error).message,
        'http-down endpoint is down',
      );
      // Typed hierarchy for caller branching.
      asserts.assert(err instanceof SloggerError);
    });

    it('collects every failing handler, not just the first', async () => {
      const logger = new Slogger({
        appName: 'FinalizeApp2',
        level: SyslogSeverities.INFO,
        handlers: [],
      });
      const failA = new RejectingHandler('sink-a', {
        level: SyslogSeverities.INFO,
      });
      const okHandler = new BufferingHandler('sink-ok', {
        level: SyslogSeverities.INFO,
      });
      const failB = new RejectingHandler('sink-b', {
        level: SyslogSeverities.INFO,
      });
      logger.registerHandler(failA);
      logger.registerHandler(okHandler);
      logger.registerHandler(failB);

      const err = await asserts.assertRejects(
        () => logger.finalize(),
        SloggerFinalizeError,
      );

      asserts.assertEquals(
        err.failures.map((f) => f.handler),
        ['sink-a', 'sink-b'],
      );
      asserts.assertEquals(okHandler.finalizeCalled, true);
      // Both attempts were made — failB was not skipped after failA.
      asserts.assertEquals(failB.finalizeCalled, true);
    });
  });

  it('explicit finalize() disarms the best-effort exit handler', async () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [
        {
          name: 'handler1',
          type: 'TestHandler',
          level: SyslogSeverities.INFO,
        },
      ],
    });

    // The constructor registers an on-exit cleanup. Awaiting finalize()
    // is the only *guaranteed* flush path (exit handlers run sync and
    // can't await async I/O), and it must detach the exit hook so the
    // process-exit path can't double-finalize afterwards.
    // @ts-expect-error Accessing private property for testing
    asserts.assertNotEquals(logger.__exitCleanup, undefined);

    await logger.finalize();

    // @ts-expect-error Accessing private property for testing
    asserts.assertEquals(logger.__exitCleanup, undefined);

    // Idempotent: a second finalize (e.g. if exit still fires) is safe.
    await logger.finalize();
  });

  it('global sampling configuration', async () => {
    // Mock Math.random for deterministic testing (sampling draws from
    // Math.random — it's a throughput control, not a security decision).
    const originalRandom = Math.random;

    try {
      // This draw should be sampled out (0.75 > sampleRate 0.5)
      Math.random = () => 0.75;

      const logger = new Slogger({
        appName: 'TestApp',
        level: SyslogSeverities.DEBUG, // Accept all logs
        handlers: [
          {
            name: 'handler1',
            type: 'TestHandler',
            level: SyslogSeverities.DEBUG,
          },
        ],
        sampling: {
          sampleRate: 0.5, // 50% sampling
          bypassSamplingForLevel: SyslogSeverities.ERROR,
        },
      });

      // @ts-expect-error Accessing protected property for testing
      const handler = logger._handlers[0] as TestHandler;
      handler.messages = [];

      // This log should be sampled out (random = 0.75 > sampleRate = 0.5)
      logger.info('This should be sampled out');
      asserts.assertEquals(handler.messages.length, 0);

      // Change random to be below sampling rate
      Math.random = () => 0.3;

      // This log should be sampled in (random = 0.3 < sampleRate = 0.5)
      logger.info('This should be sampled in');
      asserts.assertEquals(handler.messages.length, 1);

      // Error logs should bypass sampling regardless of random value
      Math.random = () => 0.75;

      // ERROR level should bypass sampling
      logger.error('This should bypass sampling');
      asserts.assertEquals(handler.messages.length, 2);

      // Test handler-level override of global sampling
      const logger2 = new Slogger({
        appName: 'TestApp',
        level: SyslogSeverities.DEBUG,
        handlers: [
          {
            name: 'handler1',
            type: 'TestHandler',
            level: SyslogSeverities.DEBUG,
            sampling: {
              sampleRate: 0.1, // 10% sampling (stricter than global 50%)
            },
          },
        ],
        sampling: {
          sampleRate: 0.5, // 50% global sampling
          bypassSamplingForLevel: SyslogSeverities.ERROR,
        },
      });

      // @ts-expect-error Accessing protected property for testing
      const handler2 = logger2._handlers[0] as TestHandler;
      handler2.messages = [];

      // Set random to be between handler rate (0.1) and global rate (0.5)
      Math.random = () => 0.3;

      // This should be sampled out by the stricter handler rate
      logger2.info('This should be sampled out by handler rate');
      asserts.assertEquals(handler2.messages.length, 0);
    } finally {
      Math.random = originalRandom;
    }
  });

  describe('scope() — pre-bound context bindings', () => {
    const makeLogger = () => {
      const logger = new Slogger({
        appName: 'ScopeApp',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'cap',
          type: 'TestHandler',
          level: SyslogSeverities.DEBUG,
        }],
      });
      // @ts-expect-error Accessing protected for test inspection
      const handler = logger._handlers[0] as TestHandler;
      handler.messages = [];
      return { logger, handler };
    };

    it('returns a wrapper that merges bindings into every emitted log', () => {
      const { logger, handler } = makeLogger();
      const scoped = logger.scope({ reqId: 'r-1' });

      scoped.info('hello');
      asserts.assertEquals(handler.messages.length, 1);
      asserts.assertEquals(handler.messages[0]!.context, { reqId: 'r-1' });
    });

    it('per-call context wins over bindings on key collision', () => {
      const { logger, handler } = makeLogger();
      const scoped = logger.scope({ reqId: 'r-1', shared: 'binding' });

      scoped.info('hello', { reqId: 'override', extra: 'x' });
      asserts.assertEquals(handler.messages[0]!.context, {
        reqId: 'override', // per-call wins
        shared: 'binding',
        extra: 'x',
      });
    });

    it('nested scopes compose bindings in order', () => {
      const { logger, handler } = makeLogger();
      const a = logger.scope({ x: 1 });
      const b = a.scope({ y: 2 });
      const c = b.scope({ z: 3, x: 99 }); // c overrides x

      c.info('hi');
      asserts.assertEquals(handler.messages[0]!.context, { x: 99, y: 2, z: 3 });
    });

    it('original logger is unaffected by scope()', () => {
      const { logger, handler } = makeLogger();
      logger.scope({ leaked: 'value' });
      logger.info('original');
      asserts.assertEquals(handler.messages[0]!.context, {});
    });

    it('lazy-context thunk still works through scopes', () => {
      const { logger, handler } = makeLogger();
      const scoped = logger.scope({ reqId: 'r-1' });

      let thunkRan = false;
      scoped.info('hi', () => {
        thunkRan = true;
        return { extra: 'computed' };
      });

      asserts.assert(thunkRan);
      asserts.assertEquals(handler.messages[0]!.context, {
        reqId: 'r-1',
        extra: 'computed',
      });
    });

    it('scoped wrapper exposes the same public read-through fields', () => {
      const { logger } = makeLogger();
      const scoped = logger.scope({ reqId: 'r-1' });

      asserts.assertEquals(scoped.appName, logger.appName);
      asserts.assertEquals(scoped.hostname, logger.hostname);
      asserts.assertEquals(scoped.level, logger.level);
    });

    it('scoped wrapper delegates to the same handlers as the root', () => {
      // Closure-based scope captures `this`; handlers live on the root
      // and are read live on each log call (not at scope-creation time).
      const { logger, handler } = makeLogger();
      const scoped = logger.scope({ reqId: 'r-1' });

      scoped.info('via scope');
      logger.info('via root');

      asserts.assertEquals(handler.messages.length, 2);
      asserts.assertEquals(handler.messages[0]!.context, { reqId: 'r-1' });
      asserts.assertEquals(handler.messages[1]!.context, {});
    });

    it('mutating the bindings object passed to scope() does not affect future logs', () => {
      const { logger, handler } = makeLogger();
      const bindings = { reqId: 'r-1' };
      const scoped = logger.scope(bindings);
      // Caller mutates their own bindings reference after the fact.
      bindings.reqId = 'tampered';

      scoped.info('hi');
      asserts.assertEquals(handler.messages[0]!.context, { reqId: 'r-1' });
    });

    it('LogManager.getLogger(name, scopes) returns a scoped instance', () => {
      LogManager.createSlogger({
        appName: 'ScopeMgrApp',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'cap',
          type: 'TestHandler',
          level: SyslogSeverities.DEBUG,
        }],
      });
      const root = LogManager.getLogger('ScopeMgrApp');
      // @ts-expect-error inspecting protected
      const handler = root._handlers[0] as TestHandler;
      handler.messages = [];

      const reqLog = LogManager.getLogger('ScopeMgrApp', {
        reqId: 'r-99',
        userId: 7,
      });
      reqLog.info('handled');
      asserts.assertEquals(handler.messages[0]!.context, {
        reqId: 'r-99',
        userId: 7,
      });

      // The cached root is unscoped — second call without scopes
      // returns the original.
      const root2 = LogManager.getLogger('ScopeMgrApp');
      asserts.assertStrictEquals(root2, root);
    });

    it('LogManager.createSlogger(config, scopes) returns a scoped instance and caches the root', () => {
      const a = LogManager.createSlogger({
        appName: 'ScopeMgrApp2',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'cap',
          type: 'TestHandler',
          level: SyslogSeverities.DEBUG,
        }],
      }, { svc: 'auth' });

      // Second call with different scopes — root cached, scoped view fresh.
      const b = LogManager.createSlogger({
        appName: 'ScopeMgrApp2',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'cap',
          type: 'TestHandler',
          level: SyslogSeverities.DEBUG,
        }],
      }, { svc: 'billing' });

      asserts.assertNotStrictEquals(a, b); // different scoped wrappers

      // Both wrappers route to the same cached root — emitting through
      // each surfaces the right scope tag at the handler.
      const root = LogManager.getLogger('ScopeMgrApp2');
      // @ts-expect-error inspecting protected
      const handler = root._handlers[0] as TestHandler;
      handler.messages = [];

      a.info('one');
      b.info('two');
      asserts.assertEquals(handler.messages.length, 2);
      asserts.assertEquals(handler.messages[0]!.context, { svc: 'auth' });
      asserts.assertEquals(handler.messages[1]!.context, { svc: 'billing' });
    });
  });
});
