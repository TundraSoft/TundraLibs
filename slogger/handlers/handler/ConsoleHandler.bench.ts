import { ConsoleHandler } from './ConsoleHandler.ts';
import { SyslogSeverities } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';
import { jsonFormatter, simpleFormatter } from '../../formatters/mod.ts';

// Helper to create a standard log object for benchmarking
const makeLogObject = (
  level: SyslogSeverities,
  message: string,
  context: Record<string, unknown> = {},
): SlogObject => ({
  id: '1',
  appName: 'benchApp',
  hostname: 'localhost',
  levelName: 'INFO',
  level,
  context,
  message,
  date: new Date(),
  isoDate: new Date().toISOString(),
  timestamp: Date.now(),
});

// Benchmark ConsoleHandler with simple formatter
Deno.bench({
  name: 'ConsoleHandler - Simple Formatter',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();
    await handler.handle(
      makeLogObject(SyslogSeverities.INFO, 'Benchmark message'),
    );
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler with JSON formatter
Deno.bench({
  name: 'ConsoleHandler - JSON Formatter',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: jsonFormatter,
    });

    await handler.init();
    await handler.handle(
      makeLogObject(SyslogSeverities.INFO, 'JSON benchmark message', {
        timestamp: Date.now(),
        randomData: Math.random(),
        nestedObject: { key: 'value', number: 42 },
      }),
    );
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler with large messages
Deno.bench({
  name: 'ConsoleHandler - Large Messages (1KB)',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: simpleFormatter('${message}'),
    });

    await handler.init();
    const largeMessage = 'X'.repeat(1024); // 1KB message
    await handler.handle(makeLogObject(SyslogSeverities.INFO, largeMessage));
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler with different severity levels
Deno.bench({
  name: 'ConsoleHandler - Emergency Level',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: simpleFormatter('[${levelName}] ${message}'),
    });

    await handler.init();
    await handler.handle(
      makeLogObject(SyslogSeverities.EMERGENCY, 'Emergency message'),
    );
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler with debug level
Deno.bench({
  name: 'ConsoleHandler - Debug Level',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: simpleFormatter('[${levelName}] ${message}'),
    });

    await handler.init();
    await handler.handle(
      makeLogObject(SyslogSeverities.DEBUG, 'Debug message'),
    );
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler with structured data
Deno.bench({
  name: 'ConsoleHandler - Structured Context Data',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: jsonFormatter,
    });

    await handler.init();

    const complexContext = {
      user: { id: 42, name: 'User42', email: 'user42@example.com' },
      request: {
        method: 'POST',
        url: '/api/endpoint',
        headers: { 'Content-Type': 'application/json' },
        body: { action: 'benchmark' },
      },
      performance: {
        startTime: Date.now(),
        duration: Math.random() * 1000,
        memoryUsage: Math.random() * 100,
      },
      metadata: {
        version: '1.0.0',
        environment: 'benchmark',
        tags: ['performance', 'test'],
      },
    };

    await handler.handle(makeLogObject(
      SyslogSeverities.INFO,
      'Complex structured log entry',
      complexContext,
    ));

    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});

// Benchmark ConsoleHandler initialization overhead
Deno.bench({
  name: 'ConsoleHandler - Init/Finalize Overhead',
  async fn() {
    const c = console;
    console.log = () => {}; // Suppress console output during benchmark
    const handler = new ConsoleHandler('benchHandler', {
      level: 7,
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();
    await handler.finalize();
    console.log = c.log; // Restore console output
  },
});
