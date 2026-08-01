import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { LogManager } from './LogManager.ts';
import { AbstractHandler, HandlerOptions } from './handlers/AbstractHandler.ts';
import { SyslogSeverities } from '@tundralibs/utils';
import { SlogObject } from './types/mod.ts';
import { SloggerConfigError } from './errors/mod.ts';
import { jsonFormatter, maskingFormatter } from './formatters/mod.ts';

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

describe('slogger.logManager', () => {
  it('default handlers and formatters', () => {
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

  describe('formatters', () => {
    it('adding and retrieving formatters', () => {
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

    it('formatter validation - invalid name', () => {
      // Test invalid formatter name
      asserts.assertThrows(
        () => LogManager.addFormatter('', () => 'test'),
        Error,
        'Formatter name must be a non-empty string',
      );
    });

    it('formatter validation - duplicate name', () => {
      // Test duplicate formatter name
      asserts.assertThrows(
        () => LogManager.addFormatter('test', () => 'duplicate'),
        SloggerConfigError,
        "Formatter 'test' is already registered",
      );
    });

    it('formatter validation - invalid function', () => {
      // Test invalid formatter function
      asserts.assertThrows(
        // @ts-expect-error Testing invalid formatter
        () => LogManager.addFormatter('test2', 'not a function'),
        Error,
        'Formatter must be a valid function',
      );
    });

    it('formatter validation - non-string return', () => {
      // Test formatter that returns non-string
      asserts.assertThrows(
        // @ts-expect-error Testing invalid return type
        () => LogManager.addFormatter('test3', () => 123),
        Error,
        'Formatter must return a string',
      );
    });

    it('formatter validation - throws error', () => {
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

    it('creating formatters from templates', () => {
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
    });

    it('template validation - invalid template', () => {
      // Template validation
      asserts.assertThrows(
        // @ts-expect-error Testing invalid template
        () => LogManager.createFormatter('invalid-template', null),
        Error,
        'Template must be a non-empty string',
      );
    });

    it('template validation - duplicate name', () => {
      // Duplicate name validation
      asserts.assertThrows(
        () => LogManager.createFormatter('template-test', '${message}'),
        Error,
        "Formatter 'template-test' is already registered",
      );
    });
  });

  describe('handlers', () => {
    it('registering and creating handlers', () => {
      // Register our test handler
      LogManager.addHandler('CustomHandler', TestHandler);

      // Verify it was registered
      const handlerTypes = LogManager.getHandlerTypes();
      asserts.assert(handlerTypes.includes('CustomHandler'));

      // Create a handler instance with function formatter
      const handler = LogManager.createHandler(
        'CustomHandler',
        'test-instance',
        {
          level: SyslogSeverities.INFO,
          formatter: (log: SlogObject) => `${log.levelName}: ${log.message}`,
        },
      );

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

    it('handler validation - invalid name', () => {
      // Test invalid handler name
      asserts.assertThrows(
        () => LogManager.addHandler('', TestHandler),
        Error,
        'Handler name must be a non-empty string',
      );
    });

    it('handler validation - duplicate name', () => {
      // Test duplicate handler name
      asserts.assertThrows(
        () => LogManager.addHandler('CustomHandler', TestHandler),
        Error,
        "Handler 'CustomHandler' is already registered",
      );
    });

    it('handler validation - invalid constructor', () => {
      // Test invalid handler constructor
      asserts.assertThrows(
        // @ts-expect-error Testing invalid constructor
        () => LogManager.addHandler('InvalidHandler', 'not a constructor'),
        Error,
        'Handler constructor must be a valid class constructor',
      );
    });

    it('handler validation - non-existent type', () => {
      // Test non-existent handler type
      asserts.assertThrows(
        () =>
          LogManager.createHandler('NonExistentHandler', 'test', {
            level: SyslogSeverities.INFO,
          }),
        SloggerConfigError,
        "Handler type 'NonExistentHandler' not found",
      );
    });

    it('handler validation - invalid formatter reference', () => {
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

  describe('createSlogger()', () => {
    it('should create a new Slogger and cache it (identical config)', () => {
      const slogger = LogManager.createSlogger({
        appName: 'TestApp-CS1',
        level: SyslogSeverities.DEBUG,
      });
      asserts.assert(slogger !== undefined);
      // Second call with a structurally identical config returns the
      // same cached instance (get-or-create).
      const slogger2 = LogManager.createSlogger({
        appName: 'TestApp-CS1',
        level: SyslogSeverities.DEBUG,
      });
      asserts.assertStrictEquals(slogger, slogger2);
    });

    it('should throw when the appName is cached with a DIFFERENT config', () => {
      LogManager.createSlogger({
        appName: 'TestApp-CS2',
        level: SyslogSeverities.DEBUG,
      });
      // Regression: this used to silently return the cached instance,
      // dropping the new level/handlers on the floor.
      asserts.assertThrows(
        () =>
          LogManager.createSlogger({
            appName: 'TestApp-CS2',
            level: SyslogSeverities.INFO, // differs → conflict
          }),
        SloggerConfigError,
        "A Slogger named 'TestApp-CS2' already exists with a different configuration",
      );
      // Differing handlers list is a conflict too.
      asserts.assertThrows(
        () =>
          LogManager.createSlogger({
            appName: 'TestApp-CS2',
            level: SyslogSeverities.DEBUG,
            handlers: [{
              name: 'x',
              type: 'ConsoleHandler',
              level: SyslogSeverities.DEBUG,
            }],
          }),
        SloggerConfigError,
        'already exists with a different configuration',
      );
    });

    it('identical configs compare structurally, not by reference', () => {
      const make = () =>
        LogManager.createSlogger({
          appName: 'TestApp-CS3',
          level: SyslogSeverities.DEBUG,
          handlers: [{
            name: 'con',
            type: 'ConsoleHandler',
            level: SyslogSeverities.INFO,
          }],
        });
      // Two calls with fresh-but-equal object literals — no throw,
      // same instance.
      asserts.assertStrictEquals(make(), make());
    });

    // Legitimate reuse path: function-valued members are compared by
    // REFERENCE IDENTITY, so reusing the SAME formatter reference across
    // calls (e.g. a hoisted `const fmt = maskingFormatter({...})`) is the
    // same config and returns the cached instance.
    it('reusing the same formatter reference dedupes (no conflict)', () => {
      const fmt = maskingFormatter({ sensitiveFields: ['password'] });
      const make = () =>
        LogManager.createSlogger({
          appName: 'TestApp-CS-fn-ref',
          level: SyslogSeverities.DEBUG,
          handlers: [{
            name: 'con',
            type: 'ConsoleHandler',
            level: SyslogSeverities.INFO,
            formatter: fmt, // SAME reference each call
          }],
        });
      const first = make();
      const second = make();
      asserts.assertStrictEquals(first, second);
    });

    // Regression (round-7 M1): __sameConfig compared function values by
    // `.toString()` source. The SAME factory called with DIFFERENT
    // (security-relevant) options produces byte-identical source, so the
    // second call silently returned the cached logger built with the
    // FIRST options — e.g. a logger meant to add `password` masking got
    // the `ssn`-only one. Function members are now compared by reference
    // identity, so a distinct formatter instance is a distinct config and
    // the conflict is raised instead of a stale (weaker) logger reused.
    it('same factory with different options is a conflict, not a silent stale reuse', () => {
      LogManager.createSlogger({
        appName: 'TestApp-CS-r7',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'con',
          type: 'ConsoleHandler',
          level: SyslogSeverities.INFO,
          formatter: maskingFormatter({ sensitiveFields: ['ssn'] }),
        }],
      });
      asserts.assertThrows(
        () =>
          LogManager.createSlogger({
            appName: 'TestApp-CS-r7',
            level: SyslogSeverities.DEBUG,
            handlers: [{
              name: 'con',
              type: 'ConsoleHandler',
              level: SyslogSeverities.INFO,
              // Same factory, strengthened masking — identical `.toString()`.
              formatter: maskingFormatter({
                sensitiveFields: ['ssn', 'password'],
              }),
            }],
          }),
        SloggerConfigError,
        'already exists with a different configuration',
      );
    });

    // Corollary of reference-identity comparison: even the SAME factory
    // with the SAME options, called fresh per call, is a distinct
    // instance and therefore a distinct config. This is the intended,
    // safe behavior — never silently inherit a possibly-stale logger.
    it('a fresh inline factory instance is a distinct config (conflict)', () => {
      const make = () =>
        LogManager.createSlogger({
          appName: 'TestApp-CS-fresh',
          level: SyslogSeverities.DEBUG,
          handlers: [{
            name: 'con',
            type: 'ConsoleHandler',
            level: SyslogSeverities.INFO,
            formatter: maskingFormatter({ sensitiveFields: ['password'] }),
          }],
        });
      make();
      asserts.assertThrows(
        make,
        SloggerConfigError,
        'already exists with a different configuration',
      );
    });

    // Regression (round-4 finding 1): the round-3 inline-factory fix
    // treated ALL functions as equal (`return true`), which removed
    // formatter differences from the conflict check entirely. A second
    // call that adds a masking formatter (config A had a plain one)
    // then silently returned the cached UNMASKED logger. A formatter
    // that differs by identity (a distinct reference) must still be a
    // conflict.
    it('a differing formatter is still a conflict (does not silently reuse unmasked logger)', () => {
      LogManager.createSlogger({
        appName: 'TestApp-CS-mask',
        level: SyslogSeverities.DEBUG,
        handlers: [{
          name: 'con',
          type: 'ConsoleHandler',
          level: SyslogSeverities.INFO,
          formatter: jsonFormatter, // plain, unmasked
        }],
      });
      // Same config shape, but the second caller asks for masking. This
      // must NOT return the cached (unmasked) instance — it must throw.
      asserts.assertThrows(
        () =>
          LogManager.createSlogger({
            appName: 'TestApp-CS-mask',
            level: SyslogSeverities.DEBUG,
            handlers: [{
              name: 'con',
              type: 'ConsoleHandler',
              level: SyslogSeverities.INFO,
              formatter: maskingFormatter({ sensitiveFields: ['password'] }),
            }],
          }),
        SloggerConfigError,
        'already exists with a different configuration',
      );
    });

    it('should create distinct Slogger instances for different appNames', () => {
      const s1 = LogManager.createSlogger({
        appName: 'App-A',
        level: SyslogSeverities.DEBUG,
      });
      const s2 = LogManager.createSlogger({
        appName: 'App-B',
        level: SyslogSeverities.DEBUG,
      });
      asserts.assert(s1 !== s2);
    });
  });

  describe('getLogger()', () => {
    it('should return an existing Slogger by name', () => {
      LogManager.createSlogger({
        appName: 'App-GL1',
        level: SyslogSeverities.DEBUG,
      });
      const slogger = LogManager.getLogger('App-GL1');
      asserts.assert(slogger !== undefined);
    });

    it('should throw when logger name does not exist', () => {
      asserts.assertThrows(
        () => LogManager.getLogger('NonExistentApp-XYZ'),
        SloggerConfigError,
        "Logger 'NonExistentApp-XYZ' not found",
      );
    });
  });
});
