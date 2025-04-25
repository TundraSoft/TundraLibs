import { ConsoleHandler } from './mod.ts';
import * as asserts from '$asserts';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';
import { simpleFormatter } from '../../formatters/string.ts';

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

Deno.test('Slogger.Handlers.ConsoleHandler', async (t) => {
  // Save and mock console.log
  const originalConsoleLog = console.log;
  const consoleLogCalls: string[] = [];

  console.log = (...args: unknown[]): void => {
    consoleLogCalls.push(String(args[0]));
  };

  try {
    await t.step('constructor - valid options', () => {
      const handler = new ConsoleHandler('testHandler', {
        level: 5,
        colorize: true,
      });

      asserts.assertEquals(handler.name, 'testHandler');
      asserts.assertEquals(handler.level, 5);
      asserts.assertEquals(handler.mode, 'console');
    });

    await t.step('constructor - default options', () => {
      const handler = new ConsoleHandler('testHandler', {
        level: 5,
      });

      // Colorize should default to false
      // @ts-ignore - Accessing protected property for testing
      asserts.assertEquals(handler._colorize, false);
    });

    await t.step('handle - logs to console without colorize', async () => {
      consoleLogCalls.length = 0;

      const handler = new ConsoleHandler('testHandler', {
        level: 5,
        colorize: false,
        formatter: simpleFormatter('${levelName}: ${message}'),
      });

      await handler.handle(makeLogObject(5, 'Test console message'));

      asserts.assertEquals(consoleLogCalls.length, 1);
      asserts.assertEquals(consoleLogCalls[0], 'NOTICE: Test console message');
    });

    await t.step('handle - logs with colorization', async () => {
      consoleLogCalls.length = 0;

      const handler = new ConsoleHandler('testHandler', {
        level: 7,
        colorize: true,
        formatter: simpleFormatter('${levelName}: ${message}'),
      });

      // Test all log levels
      await handler.handle(makeLogObject(0, 'Critical message'));
      await handler.handle(makeLogObject(1, 'Alert message'));
      await handler.handle(makeLogObject(2, 'Error message'));
      await handler.handle(makeLogObject(3, 'Error message'));
      await handler.handle(makeLogObject(4, 'Warning message'));
      await handler.handle(makeLogObject(5, 'Warning message'));
      await handler.handle(makeLogObject(6, 'Info message'));
      await handler.handle(makeLogObject(7, 'Debug message'));

      // All messages should have been logged
      asserts.assertEquals(consoleLogCalls.length, 8);
      // Check that all messages contain the expected content
      // We can't easily check colors, but we can verify the text content
      asserts.assert(
        consoleLogCalls[0]!.includes('EMERGENCY: Critical message'),
      );
      asserts.assert(consoleLogCalls[1]!.includes('ALERT: Alert message'));
      asserts.assert(consoleLogCalls[2]!.includes('CRITICAL: Error message'));
      asserts.assert(consoleLogCalls[3]!.includes('ERROR: Error message'));
      asserts.assert(consoleLogCalls[4]!.includes('WARNING: Warning message'));
      asserts.assert(consoleLogCalls[5]!.includes('NOTICE: Warning message'));
      asserts.assert(consoleLogCalls[6]!.includes('INFO: Info message'));
      asserts.assert(consoleLogCalls[7]!.includes('DEBUG: Debug message'));
    });

    await t.step('handle - respects log level', async () => {
      consoleLogCalls.length = 0;

      const handler = new ConsoleHandler('testHandler', {
        level: 5, // Only log WARNING and above
        formatter: simpleFormatter('${levelName}: ${message}'),
      });

      // This should be logged (level 5 = WARNING)
      await handler.handle(makeLogObject(5, 'Warning message'));

      // This should not be logged (level 6 = INFO, lower priority than WARNING)
      await handler.handle(makeLogObject(6, 'Info message'));

      // This should be logged (level 3 = ERROR, higher priority than WARNING)
      await handler.handle(makeLogObject(3, 'Error message'));

      asserts.assertEquals(consoleLogCalls.length, 2);
      asserts.assert(consoleLogCalls[0]!.includes('Warning message'));
      asserts.assert(consoleLogCalls[1]!.includes('Error message'));
      asserts.assert(
        !consoleLogCalls.some((msg) => msg.includes('Info message')),
      );
    });
  } finally {
    // Restore console.log
    console.log = originalConsoleLog;
  }
});
