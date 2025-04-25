import { LogManager } from './LogManager.ts';
import * as asserts from '$asserts';
import { AbstractHandler, HandlerOptions } from './handlers/AbstractHandler.ts';
import { SyslogSeverities } from '@tundralibs/utils';
import { SlogObject } from './types/mod.ts';

// Test handler implementation
class TestHandler extends AbstractHandler {
  public readonly mode = 'test';

  constructor(name: string, options: HandlerOptions) {
    super(name, options);
  }

  protected _handle(_message: string): void {
    // No-op
  }
}

Deno.test('LogManager', async (t) => {
  await t.step('default handlers and formatters', () => {
    // Check that default handlers are registered
    const handlerTypes = LogManager.getHandlerTypes();

    asserts.assert(handlerTypes.includes('FileHandler'));
    asserts.assert(handlerTypes.includes('ConsoleHandler'));
    asserts.assert(handlerTypes.includes('HTTPHandler'));
    asserts.assert(handlerTypes.includes('BlackholeHandler'));

    // Check that default formatters are registered
    const formatterNames = LogManager.getFormatterNames();
    asserts.assert(formatterNames.includes('json'));
    asserts.assert(formatterNames.includes('standard'));
    asserts.assert(formatterNames.includes('detailed'));
    asserts.assert(formatterNames.includes('compact'));
    asserts.assert(formatterNames.includes('minimalist'));
    asserts.assert(formatterNames.includes('keyValue'));
  });

  await t.step('adding and retrieving formatters', () => {
    // Create a simple test formatter
    const testFormatter = (log: SlogObject) => `TEST: ${log.message}`;

    // Add it to the manager
    LogManager.addFormatter('test', testFormatter);

    // Verify it can be retrieved
    const formatter = LogManager.getFormatter('test');
    asserts.assertNotEquals(formatter, undefined);

    // Test the formatter works
    const result = formatter!({
      id: '1',
      appName: 'test',
      hostname: 'test',
      level: SyslogSeverities.INFO,
      levelName: 'INFO',
      message: 'Hello World',
      date: new Date(),
      isoDate: new Date().toISOString(),
      timestamp: Date.now(),
      context: {},
    });

    asserts.assertEquals(result, 'TEST: Hello World');
  });

  await t.step('formatter validation', () => {
    // Test invalid formatter name
    asserts.assertThrows(
      () => LogManager.addFormatter('', () => 'test'),
      Error,
      'Formatter name must be a non-empty string',
    );

    // Test duplicate formatter name
    asserts.assertThrows(
      () => LogManager.addFormatter('test', () => 'duplicate'),
      Error,
      "Formatter 'test' is already registered",
    );

    // Test invalid formatter function
    asserts.assertThrows(
      // @ts-expect-error Testing invalid formatter
      () => LogManager.addFormatter('test2', 'not a function'),
      Error,
      'Formatter must be a valid function',
    );

    // Test formatter that returns non-string
    asserts.assertThrows(
      // @ts-expect-error Testing invalid return type
      () => LogManager.addFormatter('test3', () => 123),
      Error,
      'Formatter must return a string',
    );

    // Test formatter that throws
    asserts.assertThrows(
      () =>
        LogManager.addFormatter('test4', () => {
          throw new Error('Test error');
        }),
      Error,
      'Invalid formatter',
    );
  });

  await t.step('creating formatters from templates', () => {
    // Create a formatter from template
    const formatter = LogManager.createFormatter(
      'template-test',
      '${levelName}: ${message}',
    );

    // Test it works
    const result = formatter({
      id: '1',
      appName: 'test',
      hostname: 'test',
      level: SyslogSeverities.INFO,
      levelName: 'INFO',
      message: 'Template Test',
      date: new Date(),
      isoDate: new Date().toISOString(),
      timestamp: Date.now(),
      context: {},
    });

    asserts.assertEquals(result, 'INFO: Template Test');

    // Verify it was registered
    const retrievedFormatter = LogManager.getFormatter('template-test');
    asserts.assertNotEquals(retrievedFormatter, undefined);

    // Template validation
    asserts.assertThrows(
      // @ts-expect-error Testing invalid template
      () => LogManager.createFormatter('invalid-template', null),
      Error,
      'Template must be a non-empty string',
    );

    // Duplicate name validation
    asserts.assertThrows(
      () => LogManager.createFormatter('template-test', '${message}'),
      Error,
      "Formatter 'template-test' is already registered",
    );
  });

  await t.step('registering and creating handlers', () => {
    // Register our test handler
    LogManager.addHandler('CustomHandler', TestHandler);

    // Verify it was registered
    const handlerTypes = LogManager.getHandlerTypes();
    asserts.assert(handlerTypes.includes('CustomHandler'));

    // Create a handler instance with function formatter
    const handler = LogManager.createHandler('CustomHandler', 'test-instance', {
      level: SyslogSeverities.INFO,
      formatter: (log: SlogObject) => `${log.levelName}: ${log.message}`,
    });

    // Verify the handler was created correctly
    asserts.assert(handler instanceof TestHandler);
    asserts.assertEquals(handler.name, 'test-instance');
    asserts.assertEquals(handler.level, SyslogSeverities.INFO);

    // Create a handler instance with string formatter reference
    const handler2 = LogManager.createHandler(
      'CustomHandler',
      'string-formatter',
      {
        level: SyslogSeverities.INFO,
        formatter: 'standard',
      },
    );

    // Verify the handler was created with resolved formatter
    asserts.assert(handler2 instanceof TestHandler);
    asserts.assertEquals(handler2.name, 'string-formatter');
  });

  await t.step('handler validation', () => {
    // Test invalid handler name
    asserts.assertThrows(
      () => LogManager.addHandler('', TestHandler),
      Error,
      'Handler name must be a non-empty string',
    );

    // Test duplicate handler name
    asserts.assertThrows(
      () => LogManager.addHandler('CustomHandler', TestHandler),
      Error,
      "Handler 'CustomHandler' is already registered",
    );

    // Test invalid handler constructor
    asserts.assertThrows(
      // @ts-expect-error Testing invalid constructor
      () => LogManager.addHandler('InvalidHandler', 'not a constructor'),
      Error,
      'Handler constructor must be a valid class constructor',
    );

    // Test non-existent handler type
    asserts.assertThrows(
      () =>
        LogManager.createHandler('NonExistentHandler', 'test', {
          level: SyslogSeverities.INFO,
        }),
      Error,
      "Handler type 'NonExistentHandler' not found",
    );

    // Test invalid formatter reference
    asserts.assertThrows(
      () =>
        LogManager.createHandler('CustomHandler', 'test2', {
          level: SyslogSeverities.INFO,
          formatter: 'non-existent-formatter',
        }),
      Error,
      "Formatter 'non-existent-formatter' not found",
    );
  });
});
