import { Slogger } from './Slogger.ts';
import * as asserts from '$asserts';
import { AbstractHandler } from './handlers/AbstractHandler.ts';
import { SyslogSeverities } from '@tundralibs/utils';
import { LogManager } from './LogManager.ts';
import { SlogObject } from './types/mod.ts';

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

Deno.test('Slogger', async (t) => {
  await t.step('constructor - valid options', () => {
    const logger = new Slogger({
      appName: 'TestApp',
      level: SyslogSeverities.INFO,
      handlers: [],
    });

    asserts.assertEquals(logger.appName, 'TestApp');
    asserts.assertEquals(logger.level, SyslogSeverities.INFO);
  });

  await t.step('constructor - validation', async (d) => {
    await d.step('invalid appName', () => {
      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'a'.repeat(31), // Too long
            level: SyslogSeverities.INFO,
            handlers: [],
          }),
        Error,
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

    await d.step('invalid level', () => {
      asserts.assertThrows(
        () =>
          new Slogger({
            appName: 'TestApp',
            // @ts-expect-error Testing invalid level
            level: -1,
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

    await d.step('invalid handler options', () => {
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
  });

  await t.step(
    'constructor - validation with new configuration format',
    async (d) => {
      await d.step('invalid handler options', () => {
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

  await t.step('handler initialization', () => {
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
    asserts.assertEquals((handlers[0] as TestHandler).initCalled, true);
  });

  await t.step('handler initialization with new configuration format', () => {
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
    asserts.assertEquals((handlers[0] as TestHandler).initCalled, true);
  });

  await t.step('log level filtering', async () => {
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
    await logger.info('This should be filtered by logger');
    asserts.assertEquals(handler.messages.length, 0);

    // This should pass both filters (WARNING = WARNING)
    await logger.warning('This should be logged');
    asserts.assertEquals(handler.messages.length, 1);
    asserts.assertEquals(handler.messages[0]!.message, 'This should be logged');
    asserts.assertEquals(handler.messages[0]!.levelName, 'WARNING');

    // This should pass both filters (ERROR > WARNING)
    await logger.error('Error message');
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
    await logger2.info('This should be filtered by handler');
    asserts.assertEquals(handler2.messages.length, 0);

    // This should pass logger's filter but be filtered by handler
    await logger2.warning('This should be filtered by handler');
    asserts.assertEquals(handler2.messages.length, 0);

    // This should pass both filters
    await logger2.error('This should be logged');
    asserts.assertEquals(handler2.messages.length, 1);
    asserts.assertEquals(
      handler2.messages[0]!.message,
      'This should be logged',
    );
  });

  await t.step('convenience methods', async () => {
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
    await logger.debug('Debug message');
    await logger.info('Info message');
    await logger.information('Information message'); // Alias
    await logger.notice('Notice message');
    await logger.warn('Warning message');
    await logger.warning('Warning message'); // Alias
    await logger.err('Error message');
    await logger.error('Error message'); // Alias
    await logger.crit('Critical message');
    await logger.critical('Critical message'); // Alias
    await logger.alert('Alert message');
    await logger.emerg('Emergency message');
    await logger.emergency('Emergency message'); // Alias

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

  await t.step('context variables', async () => {
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

    // Test with context variables
    const context = {
      userId: 123,
      action: 'login',
      timestamp: new Date().toISOString(),
    };

    await logger.info(
      'User ${userId} performed ${action} at ${timestamp}',
      context,
    );

    asserts.assertEquals(handler.messages.length, 1);
    asserts.assert(
      handler.messages[0]!.message.includes('User 123 performed login at'),
    );
    asserts.assertEquals(handler.messages[0]!.context, context);
  });

  await t.step('log message generation', async () => {
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

      await logger.info('Test message');

      asserts.assertEquals(handler.messages.length, 1);
      const log = handler.messages[0]!;

      // Verify all log fields
      asserts.assert(typeof log.id === 'string');
      asserts.assertEquals(log.appName, 'TestApp');
      asserts.assertEquals(log.hostname, Deno.hostname() || 'localhost');
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

  await t.step('handler registration', () => {
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
      Error,
      'Handler must be an instance of AbstractHandler',
    );
  });

  await t.step('finalization', async () => {
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

    // Manually call _unload (normally triggered by unload event)
    // @ts-expect-error Accessing protected method for testing
    await logger._unload();

    asserts.assertEquals(handler.finalizeCalled, true);
  });

  await t.step('global sampling configuration', async () => {
    // Mock Math.random for deterministic testing
    const originalRandom = Math.random;

    try {
      // Set up a deterministic random function
      Math.random = () => 0.75; // Above 0.5 sampling rate

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
      await logger.info('This should be sampled out');
      asserts.assertEquals(handler.messages.length, 0);

      // Change random to be below sampling rate
      Math.random = () => 0.3; // Below 0.5 sampling rate

      // This log should be sampled in (random = 0.3 < sampleRate = 0.5)
      await logger.info('This should be sampled in');
      asserts.assertEquals(handler.messages.length, 1);

      // Error logs should bypass sampling regardless of random value
      Math.random = () => 0.75; // Above 0.5 sampling rate

      // ERROR level should bypass sampling
      await logger.error('This should bypass sampling');
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
      await logger2.info('This should be sampled out by handler rate');
      asserts.assertEquals(handler2.messages.length, 0);
    } finally {
      Math.random = originalRandom;
    }
  });
});
