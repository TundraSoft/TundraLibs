import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { ConsoleHandler } from './ConsoleHandler.ts';
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

// Test double that captures console output instead of logging it
class TestConsoleHandler extends ConsoleHandler {
  public capturedMessages: string[] = [];

  protected override _handle(message: string): void {
    this.capturedMessages.push(message);
  }
}

describe('slogger.handlers.consoleHandler', () => {
  it('constructor - valid options', () => {
    const handler = new ConsoleHandler('testHandler', {
      level: 5,
      useColor: true,
    });

    asserts.assertEquals(handler.name, 'testHandler');
    asserts.assertEquals(handler.level, 5);
    asserts.assertEquals(handler.mode, 'console');
  });

  it('constructor - default options', () => {
    const handler = new ConsoleHandler('testHandler', {
      level: 5,
    });

    // useColor should default to false
    // @ts-ignore - Accessing protected property for testing
    asserts.assertEquals(handler._useColor, false);
  });

  it('handle - logs to console without useColor', async () => {
    const handler = new TestConsoleHandler('testHandler', {
      level: 5,
      useColor: false,
      formatter: simpleFormatter('${levelName}: ${message}'),
    });

    await handler.handle(makeLogObject(5, 'Test console message'));

    asserts.assertEquals(handler.capturedMessages.length, 1);
    asserts.assertEquals(
      handler.capturedMessages[0],
      'NOTICE: Test console message',
    );
  });

  it('handle - logs with colorization', async () => {
    const handler = new TestConsoleHandler('testHandler', {
      level: 7,
      useColor: true,
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

    // All messages should have been captured
    asserts.assertEquals(handler.capturedMessages.length, 8);
    // Check that all messages contain the expected content
    // Colors are applied but text content is preserved
    asserts.assert(
      handler.capturedMessages[0]!.includes('EMERGENCY: Critical message'),
    );
    asserts.assert(
      handler.capturedMessages[1]!.includes('ALERT: Alert message'),
    );
    asserts.assert(
      handler.capturedMessages[2]!.includes('CRITICAL: Error message'),
    );
    asserts.assert(
      handler.capturedMessages[3]!.includes('ERROR: Error message'),
    );
    asserts.assert(
      handler.capturedMessages[4]!.includes('WARNING: Warning message'),
    );
    asserts.assert(
      handler.capturedMessages[5]!.includes('NOTICE: Warning message'),
    );
    asserts.assert(handler.capturedMessages[6]!.includes('INFO: Info message'));
    asserts.assert(
      handler.capturedMessages[7]!.includes('DEBUG: Debug message'),
    );
  });

  it('handle - respects log level', async () => {
    const handler = new TestConsoleHandler('testHandler', {
      level: 5, // Only log WARNING and above
      formatter: simpleFormatter('${levelName}: ${message}'),
    });

    // This should be logged (level 5 = WARNING)
    await handler.handle(makeLogObject(5, 'Warning message'));

    // This should not be logged (level 6 = INFO, lower priority than WARNING)
    await handler.handle(makeLogObject(6, 'Info message'));

    // This should be logged (level 3 = ERROR, higher priority than WARNING)
    await handler.handle(makeLogObject(3, 'Error message'));

    asserts.assertEquals(handler.capturedMessages.length, 2);
    asserts.assert(handler.capturedMessages[0]!.includes('Warning message'));
    asserts.assert(handler.capturedMessages[1]!.includes('Error message'));
    asserts.assert(
      !handler.capturedMessages.some((msg) => msg.includes('Info message')),
    );
  });

  it('handle - real ConsoleHandler calls console.log', async () => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => captured.push(msg);

    try {
      const handler = new ConsoleHandler('realConsole', {
        level: 7,
        formatter: simpleFormatter('${message}'),
      });

      await handler.handle(makeLogObject(5, 'real console output'));
    } finally {
      console.log = originalLog;
    }

    asserts.assertStrictEquals(captured.length, 1);
    asserts.assertStrictEquals(captured[0], 'real console output');
  });
});
