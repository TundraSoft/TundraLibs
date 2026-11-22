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

// Captures what reaches stdout, one entry per write.
const captureStdout = async (
  fn: (writes: string[]) => void | Promise<void>,
): Promise<string[]> => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const writes: string[] = [];
  if (g.Deno !== undefined) {
    const original = g.Deno.stdout.writeSync;
    g.Deno.stdout.writeSync = (b: Uint8Array) => {
      writes.push(new TextDecoder().decode(b));
      return b.length;
    };
    try {
      await fn(writes);
    } finally {
      g.Deno.stdout.writeSync = original;
    }
  } else {
    const original = g.process.stdout.write;
    // Node's test runner reports through stdout too (as bytes): pass
    // anything that is not ours through untouched.
    g.process.stdout.write = (t: unknown, ...rest: unknown[]) => {
      if (typeof t !== 'string') {
        return original.call(g.process.stdout, t, ...rest);
      }
      writes.push(t);
      return true;
    };
    try {
      await fn(writes);
    } finally {
      g.process.stdout.write = original;
    }
  }
  return writes;
};

const nextTurn = () => new Promise((r) => setTimeout(r, 0));

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

  it('handle - unbuffered ConsoleHandler calls console.log', async () => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => captured.push(msg);

    try {
      const handler = new ConsoleHandler('realConsole', {
        level: 7,
        buffered: false,
        formatter: simpleFormatter('${message}'),
      });

      await handler.handle(makeLogObject(5, 'real console output'));
    } finally {
      console.log = originalLog;
    }

    asserts.assertStrictEquals(captured.length, 1);
    asserts.assertStrictEquals(captured[0], 'real console output');
  });

  it('buffered - lines go out together on the next turn', async () => {
    const handler = new ConsoleHandler('buffered', {
      level: 7,
      formatter: simpleFormatter('${message}'),
    });
    let before: string[] = [];
    const writes = await captureStdout(async (writes) => {
      void handler.handle(makeLogObject(6, 'one'));
      void handler.handle(makeLogObject(6, 'two'));
      before = [...writes];
      await nextTurn();
    });
    asserts.assertEquals(before, []);
    asserts.assertEquals(writes, ['one\ntwo\n']);
  });

  it('buffered - an ERROR record writes everything pending at once', async () => {
    const handler = new ConsoleHandler('buffered', {
      level: 7,
      formatter: simpleFormatter('${message}'),
    });
    const writes = await captureStdout(async (writes) => {
      void handler.handle(makeLogObject(6, 'context'));
      void handler.handle(makeLogObject(3, 'failure'));
      asserts.assertEquals(writes, ['context\nfailure\n']);
      await nextTurn();
    });
    asserts.assertEquals(writes, ['context\nfailure\n']);
  });

  it('buffered - finalize writes everything pending', async () => {
    const handler = new ConsoleHandler('buffered', {
      level: 7,
      formatter: simpleFormatter('${message}'),
    });
    const writes = await captureStdout(async (writes) => {
      void handler.handle(makeLogObject(6, 'last words'));
      await handler.finalize();
      asserts.assertEquals(writes, ['last words\n']);
      await nextTurn();
    });
    asserts.assertEquals(writes, ['last words\n']);
  });

  it('buffered - a large backlog is written without waiting', async () => {
    const handler = new ConsoleHandler('buffered', {
      level: 7,
      formatter: simpleFormatter('${message}'),
    });
    const line = 'x'.repeat(1023);
    const writes = await captureStdout(async (writes) => {
      for (let i = 0; i < 64; i++) void handler.handle(makeLogObject(6, line));
      asserts.assertEquals(writes.length, 1);
      await nextTurn();
    });
    asserts.assertEquals(writes.join(''), `${line}\n`.repeat(64));
  });

  for (
    const [how, end, code] of [
      ['an uncaught error', "throw new Error('boom');", 1],
      ['Deno.exit()', 'Deno.exit(0);', 0],
    ] as const
  ) {
    it({
      name: `buffered - pending lines reach stdout when ${how} ends Deno`,
      // Deno fires no exit event on a crash, so it needs its own hook;
      // the child process is run with Deno itself.
      bun: false,
      node: false,
      fn: async () => {
        const root = new URL('../../../../', import.meta.url).pathname;
        const handler = new URL('./ConsoleHandler.ts', import.meta.url).href;
        const script = `import { ConsoleHandler } from '${handler}';
const h = new ConsoleHandler('c', { level: 7, formatter: (l) => l.message });
void h.handle({ level: 6, message: 'last line' });
${end}`;
        const out = await new Deno.Command(Deno.execPath(), {
          args: ['eval', '--config', `${root}deno.json`, script],
          stdout: 'piped',
          stderr: 'piped',
        }).output();
        asserts.assertEquals(out.code, code);
        asserts.assertEquals(
          new TextDecoder().decode(out.stdout),
          'last line\n',
        );
      },
    });
  }
});
