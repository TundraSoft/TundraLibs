import { FileHandler } from './FileHandler.ts';
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

// Test directory for benchmarks
const BENCH_DIR = './slogger/handlers/handler/fixtures/bench/';

// Setup function
async function setupBenchmarkDir() {
  try {
    await Deno.mkdir(BENCH_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

// Cleanup function
async function cleanupBenchmarkDir() {
  try {
    await Deno.remove(BENCH_DIR, { recursive: true });
  } catch {
    // Directory might not exist or have permission issues
  }
}

// Benchmark FileHandler with small messages
Deno.bench({
  name: 'slogger.FileHandler Small - Messages (100 chars)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'small-bench.log',
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();

    const message =
      'Small benchmark message with some additional content to reach approximately 100 characters.';
    await handler.handle(makeLogObject(SyslogSeverities.INFO, message));

    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler with large messages
Deno.bench({
  name: 'slogger.FileHandler Large - Messages (1KB)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'large-bench.log',
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
      bufferSize: 8192, // Larger buffer for large messages
    });

    await handler.init();

    const message = 'X'.repeat(1024); // 1KB message
    await handler.handle(makeLogObject(SyslogSeverities.INFO, message));

    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler with JSON formatter
Deno.bench({
  name: 'slogger.FileHandler JSON - Formatter',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'json-bench.log',
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
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler with high-severity auto-flush
Deno.bench({
  name: 'slogger.FileHandler Error - Level (Auto-Flush)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'error-bench.log',
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();

    // Test ERROR level which triggers auto-flush
    await handler.handle(
      makeLogObject(
        SyslogSeverities.ERROR,
        'Error message that triggers flush',
      ),
    );

    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler with info level (buffered)
Deno.bench({
  name: 'slogger.FileHandler Info - Level (Buffered)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'info-bench.log',
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();

    // Test INFO level which stays in buffer
    await handler.handle(
      makeLogObject(SyslogSeverities.INFO, 'Info message that stays in buffer'),
    );

    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler with different buffer sizes
Deno.bench({
  name: 'slogger.FileHandler Small - Buffer (1KB)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'small-buffer-bench.log',
      formatter: simpleFormatter('${message}'),
      bufferSize: 1024, // 1KB buffer
    });

    await handler.init();
    await handler.handle(makeLogObject(SyslogSeverities.INFO, 'Test message'));
    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

Deno.bench({
  name: 'slogger.FileHandler Large - Buffer (64KB)',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'large-buffer-bench.log',
      formatter: simpleFormatter('${message}'),
      bufferSize: 65536, // 64KB buffer
    });

    await handler.init();
    await handler.handle(makeLogObject(SyslogSeverities.INFO, 'Test message'));
    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});

// Benchmark FileHandler initialization overhead
Deno.bench({
  name: 'slogger.FileHandler - Init/Finalize Overhead',
  permissions: { read: true, write: true },
  async fn() {
    await setupBenchmarkDir();

    const handler = new FileHandler('benchHandler', {
      level: 7,
      storePath: BENCH_DIR,
      fileName: 'init-bench.log',
      formatter: simpleFormatter('${date} [${levelName}] ${message}'),
    });

    await handler.init();
    await handler.finalize();
    await cleanupBenchmarkDir();
  },
});
