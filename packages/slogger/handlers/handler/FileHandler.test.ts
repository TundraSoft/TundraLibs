import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { FileHandler, type FileHandlerOptions } from './mod.ts';
import { isEphemeralFilesystem } from './FileHandler.ts';
import { SlogObject } from '../../types/mod.ts';
import * as path from '@tundralibs/compat/path';
import {
  ensureDir,
  FileInfo,
  readDir,
  readTextFile,
  remove,
  stat,
  writeTextFile,
} from '@tundralibs/compat';
import { simpleFormatter } from '../../formatters/string.ts';
import { LogManager } from '../../LogManager.ts';

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

// Test directory for file handler (using fixtures)
const TEST_DIR = './packages/slogger/handlers/handler/fixtures/file/';

// Setup and teardown for tests
async function setup() {
  try {
    await ensureDir(TEST_DIR);
  } catch (e) {
    console.error(`Error creating test directory: ${(e as Error).message}`);
  }
}

async function teardown() {
  try {
    await remove(TEST_DIR);
  } catch (e) {
    console.error(`Error removing test directory: ${(e as Error).message}`);
  }
}

// Helper to clean up specific test files
async function cleanupTestFile(filename: string) {
  try {
    await remove(path.join(TEST_DIR, filename));
  } catch {
    // File might not exist
  }
}

// Helper to check if file exists and get its content
async function readTestFile(filename: string): Promise<string | null> {
  try {
    return await readTextFile(path.join(TEST_DIR, filename));
  } catch {
    return null;
  }
}

// Helper to get file info
async function getTestFileInfo(
  filename: string,
): Promise<FileInfo | null> {
  try {
    return await stat(path.join(TEST_DIR, filename));
  } catch {
    return null;
  }
}

// A `statfs` reading measured on real workerd (wrangler 4.123.0,
// nodejs_compat, compat date 2026-08-04): every path, existing or not,
// answers with this all-zero struct.
const WORKERD_STATFS = () => ({
  type: 0,
  bsize: 0,
  blocks: 0,
  bfree: 0,
  files: 0,
  ffree: 0,
});

// The same call on a real filesystem (macOS, via Deno/Node/Bun
// `node:fs.statfsSync`).
const REAL_STATFS = () => ({
  type: 26,
  bsize: 4096,
  blocks: 194009419,
  bfree: 114557368,
  files: 4584645274,
  ffree: 4582076760,
});

// Capture the out-of-band console.error channel for the duration of
// `fn` and return only what slogger itself reported.
async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map((a) => String(a)).join(' '));
  };
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return captured.filter((m) => m.includes('[slogger]'));
}

// Helper to list files in test directory
async function listTestFiles(pattern?: string): Promise<string[]> {
  try {
    const files: string[] = [];
    for await (const entry of readDir(TEST_DIR)) {
      if (entry.isFile && (!pattern || entry.name.includes(pattern))) {
        files.push(entry.name);
      }
    }
    return files;
  } catch {
    return [];
  }
}

describe({
  name: 'slogger.handlers.fileHandler',
  permissions: { write: true, read: true },
  fn: () => {
    beforeAll(async () => {
      await setup();
    });

    afterAll(async () => {
      await teardown();
    });

    it('constructor - valid options', () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: 'test.log',
        maxFileSizeBytes: 10 * 1024 * 1024, // 10 MiB
        bufferSizeBytes: 4096,
      });

      asserts.assertEquals(handler.name, 'testHandler');
      asserts.assertEquals(handler.level, 5);
      asserts.assertEquals(handler.mode, 'file');
    });

    it('missing directory', () => {
      asserts.assertThrows(
        // @ts-ignore - Testing missing directory
        () =>
          new FileHandler('testHandler', {
            level: 5,
            filenameTemplate: 'test.log',
          } as FileHandlerOptions),
        Error,
        'valid directory',
      );
    });

    it('missing filenameTemplate', () => {
      asserts.assertThrows(
        // @ts-ignore - Testing missing filenameTemplate
        () =>
          new FileHandler('testHandler', {
            level: 5,
            directory: TEST_DIR,
          } as FileHandlerOptions),
        Error,
        'valid filenameTemplate',
      );
    });

    it('invalid maxFileSizeBytes', () => {
      asserts.assertThrows(
        () =>
          new FileHandler('testHandler', {
            level: 5,
            directory: TEST_DIR,
            filenameTemplate: 'test.log',
            maxFileSizeBytes: -1, // negative size
          }),
        Error,
        'positive maxFileSizeBytes',
      );
    });

    it('invalid bufferSizeBytes', () => {
      asserts.assertThrows(
        () =>
          new FileHandler('testHandler', {
            level: 5,
            directory: TEST_DIR,
            filenameTemplate: 'test.log',
            bufferSizeBytes: -1, // negative size
          }),
        Error,
        'positive number',
      );
    });

    it('init - creates file handle and directory', async () => {
      const filename = 'init-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
      });

      await handler.init();
      await handler.finalize();

      // Check that directory exists
      const dirInfo = await stat(TEST_DIR);
      asserts.assertEquals(dirInfo.isDirectory, true);

      // Check that file was created (even if empty)
      const fileInfo = await getTestFileInfo(filename);
      asserts.assertNotEquals(fileInfo, null);
      asserts.assertEquals(fileInfo!.isFile, true);
    });

    it('handle - writes log to file', async () => {
      const filename = 'handle-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Handle a log entry
      await handler.handle(makeLogObject(5, 'Test message'));

      // Finalize to flush buffer
      await handler.finalize();

      // Check that message was written to file
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      if (content) {
        asserts.assert(content.includes('Test message'));
      }
    });

    it('handle - flushes on high severity', async () => {
      const filename = 'severity-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Send a low severity message (should stay in buffer)
      await handler.handle(makeLogObject(5, 'Low severity'));

      // Send a high severity message (ERROR level) - should trigger immediate flush
      await handler.handle(makeLogObject(3, 'High severity'));

      // Read file content immediately (before finalize)
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      if (content) {
        asserts.assert(content.includes('Low severity'));
        asserts.assert(content.includes('High severity'));
      }

      await handler.finalize();
    });

    it('handle large messages - direct write', async () => {
      const filename = 'large-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        bufferSizeBytes: 100, // Small buffer to test direct write
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Create a message larger than buffer size
      const largeMessage = 'x'.repeat(150);
      await handler.handle(makeLogObject(5, largeMessage));

      await handler.finalize();

      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      if (content) {
        asserts.assert(content.includes(largeMessage));
      }
    });

    it('handle - buffer overflow and flush', async () => {
      const filename = 'buffer-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        bufferSizeBytes: 50, // Small buffer
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Send multiple messages to overflow buffer
      await handler.handle(makeLogObject(5, 'First message'));
      await handler.handle(makeLogObject(5, 'Second message'));
      await handler.handle(makeLogObject(5, 'Third message'));

      await handler.finalize();

      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      if (content) {
        asserts.assert(content.includes('First message'));
        asserts.assert(content.includes('Second message'));
        asserts.assert(content.includes('Third message'));
      }
    });

    it('file rotation - max size exceeded', async () => {
      const filename = 'rotation-test.log';
      await cleanupTestFile(filename);

      // Clean up any potential rotated files
      const existingFiles = await listTestFiles('rotation-test');
      for (const file of existingFiles) {
        await cleanupTestFile(file);
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        maxFileSizeBytes: 1024, // 1 KiB — small enough to trigger rotation
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Send enough data to trigger rotation
      const bigMessage = 'x'.repeat(500); // 500 bytes
      await handler.handle(makeLogObject(5, bigMessage));
      await handler.handle(makeLogObject(5, bigMessage));
      await handler.handle(makeLogObject(5, bigMessage)); // Should trigger rotation

      await handler.finalize();

      // Check that original file exists
      const originalContent = await readTestFile(filename);
      asserts.assertNotEquals(originalContent, null);

      // Check that rotated file was created
      const rotatedFiles = await listTestFiles('rotation-test');
      const rotatedFile = rotatedFiles.find((f) =>
        f !== filename && f.startsWith('rotation-test.log_')
      );
      asserts.assertNotEquals(
        rotatedFile,
        undefined,
        'Rotated file should exist',
      );
    });

    it('error handling - uninitialized handler', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: 'error-test.log',
        formatter: simpleFormatter('${message}'),
      });

      // Don't call init - this should cause the error when trying to handle a message
      await asserts.assertRejects(
        () => handler.handle(makeLogObject(5, 'Test message')),
        Error,
        'FileHandler not initialized',
      );
    });

    it('error handling - double finalize', async () => {
      const filename = 'double-finalize.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();
      await handler.finalize();

      // Second finalize should not throw
      await handler.finalize();
    });

    it('variable replacement in paths', async () => {
      const testDirWithVar = path.join(TEST_DIR, 'testHandler-logs');

      // Clean up test directory
      try {
        await remove(testDirWithVar);
      } catch {
        // Directory might not exist
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: path.join(TEST_DIR, '${name}-logs'),
        filenameTemplate: '${name}-${date}.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      await handler.handle(makeLogObject(5, 'Variable test message'));
      await handler.finalize();

      // Check that directory with variable was created
      const dirInfo = await stat(testDirWithVar);
      asserts.assertEquals(dirInfo.isDirectory, true);

      // Find the log file (with date in filename)
      const files: string[] = [];
      for await (const entry of readDir(testDirWithVar)) {
        if (entry.isFile && entry.name.endsWith('.log')) {
          files.push(entry.name);
        }
      }

      asserts.assertEquals(files.length, 1);
      const logFileName = files[0];
      asserts.assertNotEquals(logFileName, undefined);
      if (logFileName) {
        asserts.assert(logFileName.startsWith('testHandler-'));
        asserts.assert(logFileName.endsWith('.log'));

        // Verify content
        const content = await readTextFile(
          path.join(testDirWithVar, logFileName),
        );
        asserts.assert(content.includes('Variable test message'));
      }

      // Clean up
      await remove(testDirWithVar);
    });

    it('concurrent writes are serialized (no interleaving)', async () => {
      const filename = 'concurrent-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        // Small buffer so most messages flush mid-stream, maximising
        // the window for interleaving if writes weren't serialized.
        bufferSizeBytes: 16,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Fire-and-forget exactly how Slogger.log() dispatches: many
      // overlapping handle() promises that all touch the shared buffer.
      const count = 200;
      const pending: Array<Promise<void>> = [];
      for (let i = 0; i < count; i++) {
        // Fixed-width line so we can assert byte-exact, ungarbled rows.
        const line = `line-${String(i).padStart(4, '0')}`;
        pending.push(handler.handle(makeLogObject(5, line)));
      }
      await Promise.all(pending);
      await handler.finalize();

      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);

      const lines = content!.split('\n').filter((l) => l.length > 0);
      // Every message must appear exactly once, fully intact — no
      // partial / interleaved bytes from a racing write.
      asserts.assertEquals(lines.length, count);
      const expected = new Set<string>();
      for (let i = 0; i < count; i++) {
        expected.add(`line-${String(i).padStart(4, '0')}`);
      }
      for (const l of lines) {
        asserts.assert(
          expected.has(l),
          `unexpected / corrupted line: ${JSON.stringify(l)}`,
        );
        expected.delete(l);
      }
      asserts.assertEquals(expected.size, 0, 'some lines were lost');
    });

    it('init on an oversized existing file rotates and opens the handle exactly once', async () => {
      // Regression: init() opened the log file TWICE when the existing
      // file was already over the rotation threshold — __rotateLogFile()
      // opens a fresh handle, then init() unconditionally opened another,
      // orphaning the FIRST descriptor (an fd leak) and leaving two
      // handles on the same file. On this path the log file must be
      // opened EXACTLY ONCE. (The leaked descriptor is not reliably
      // observable via a resource sanitizer, so we count the opens
      // directly through the single _openLogFile funnel instead.)
      //
      // The previous version of this test wrote only ~13 bytes against a
      // 100-byte cap, so the `size >= maxFileSizeBytes` branch never ran
      // and neither the rotation nor the leak was exercised.
      const filename = 'existing-size.log';
      await cleanupTestFile(filename);
      for (const f of await listTestFiles(`${filename}_`)) {
        await cleanupTestFile(f);
      }

      // Seed a file whose size is comfortably OVER the cap we'll use.
      const seedHandler = new FileHandler('seedHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });
      await seedHandler.init();
      // 'X'.repeat(200) + '\n' = 201 bytes, well over the 100-byte cap.
      await seedHandler.handle(makeLogObject(5, 'X'.repeat(200)));
      await seedHandler.finalize();

      const seededSize = (await getTestFileInfo(filename))?.size ?? 0;
      asserts.assert(
        seededSize > 100,
        `seed file should exceed the cap, got ${seededSize} bytes`,
      );

      // Count how many times init opens a file handle on the rotation
      // path. The bug opens twice (rotate + init); the fix opens once
      // (rotate only — init skips the redundant open). _openLogFile is
      // the single funnel both open sites now go through.
      let openCount = 0;
      class CountingFileHandler extends FileHandler {
        protected override _openLogFile() {
          openCount++;
          return super._openLogFile();
        }
      }

      const handler = new CountingFileHandler('rotateHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        maxFileSizeBytes: 100, // Small enough that the seed triggers rotation.
      });

      await handler.init();
      asserts.assertEquals(
        openCount,
        1,
        'init on an oversized file must open the log handle exactly once ' +
          '(twice means the rotation handle was leaked)',
      );

      // Rotation actually happened: a timestamped sibling exists and the
      // active file was recreated fresh (0 bytes).
      const rotated = await listTestFiles(`${filename}_`);
      asserts.assert(
        rotated.length >= 1,
        'expected a rotated (timestamped) file after init rotation',
      );
      const freshSize = (await getTestFileInfo(filename))?.size ?? -1;
      asserts.assertEquals(
        freshSize,
        0,
        'active file should be freshly created',
      );

      // The single live handle still writes correctly, then closes clean.
      await handler.handle(makeLogObject(5, 'after-rotate'));
      await handler.finalize();
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      asserts.assertStringIncludes(content!, 'after-rotate');
    });

    // Regression (round-3 finding 3): the ${date}/${year} placeholders
    // used the invalid @std/datetime token 'YYYY', which is emitted
    // verbatim — so filenames rendered literal 'YYYY' instead of the
    // real date, defeating date-based partitioning.
    it('date/year placeholders expand to real digits, not literal YYYY', async () => {
      // Clean any leftover from a prior run.
      for (const f of await listTestFiles('ymd-')) {
        await cleanupTestFile(f);
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: 'ymd-${date}-${year}.log',
        formatter: simpleFormatter('${message}'),
      });
      await handler.init();
      await handler.handle(makeLogObject(5, 'dated'));
      await handler.finalize();

      const files = await listTestFiles('ymd-');
      asserts.assertEquals(files.length, 1);
      const name = files[0]!;
      asserts.assert(
        !name.includes('YYYY'),
        `filename must not contain literal 'YYYY': ${name}`,
      );
      // ymd-<yyyy-MM-dd>-<yyyy>.log
      asserts.assert(
        /^ymd-\d{4}-\d{2}-\d{2}-\d{4}\.log$/.test(name),
        `filename should carry real date digits: ${name}`,
      );
      await cleanupTestFile(name);
    });

    // Regression (round-3 finding 9): the rotated filename had only
    // one-second resolution and moveFile silently overwrites, so two
    // rotations in the same second destroyed the first rotated file.
    it('two same-second rotations keep both rotated files (no overwrite)', async () => {
      const filename = 'uniqueness-test.log';
      await cleanupTestFile(filename);
      for (const f of await listTestFiles('uniqueness-test')) {
        await cleanupTestFile(f);
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        maxFileSizeBytes: 50, // tiny cap: each message triggers a rotation
        formatter: simpleFormatter('${message}'),
      });
      await handler.init();

      const msgA = 'A'.repeat(80);
      const msgB = 'B'.repeat(80);
      // Two writes back-to-back → two rotations within the same second.
      await handler.handle(makeLogObject(5, msgA));
      await handler.handle(makeLogObject(5, msgB));
      await handler.finalize();

      const rotated = (await listTestFiles('uniqueness-test'))
        .filter((f) => f.startsWith('uniqueness-test.log_'));
      asserts.assertEquals(
        rotated.length,
        2,
        `both rotated files must survive, got: ${JSON.stringify(rotated)}`,
      );
      // Neither rotated payload was destroyed by an overwrite.
      const contents = await Promise.all(
        rotated.map((f) => readTestFile(f)),
      );
      const joined = contents.join('');
      asserts.assertStringIncludes(joined, msgA);
      asserts.assertStringIncludes(joined, msgB);

      await cleanupTestFile(filename);
      for (const f of rotated) await cleanupTestFile(f);
    });

    // Regression (round-3 finding 1): LogManager.createHandler
    // fire-and-forgot handler.init(), so records logged immediately
    // after construction hit an unopened file, threw, and were silently
    // dropped by Slogger.log()'s swallowing .catch.
    it('records logged immediately after createHandler are not dropped', async () => {
      const filename = 'early-logs.log';
      await cleanupTestFile(filename);

      // Exactly the declarative path: createHandler kicks off async
      // init() without awaiting it.
      const handler = LogManager.createHandler('FileHandler', 'earlyLogs', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      // Log immediately (fire-and-forget, as Slogger.log dispatches) —
      // BEFORE init() could have opened the file.
      handler.handle(makeLogObject(5, 'FIRST')).catch(() => {});
      handler.handle(makeLogObject(5, 'SECOND')).catch(() => {});
      await handler.finalize();

      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      asserts.assertStringIncludes(content!, 'FIRST');
      asserts.assertStringIncludes(content!, 'SECOND');
      await cleanupTestFile(filename);
    });

    // Regression (round-3 finding 1): a failed init (directory path is a
    // regular file) used to escape as an uncaught rejection that crashed
    // the process. It must now surface through finalize() instead.
    it('a failed init surfaces via finalize() rather than crashing', async () => {
      const clashPath = path.join(TEST_DIR, 'not-a-dir');
      await writeTextFile(clashPath, 'i am a file, not a directory');

      const handler = LogManager.createHandler('FileHandler', 'badDir', {
        level: 5,
        directory: clashPath, // a regular file → init() fails
        filenameTemplate: 'x.log',
        formatter: simpleFormatter('${message}'),
      });

      await asserts.assertRejects(() => handler.finalize());
      await remove(clashPath);
    });
  },
});

// Issue #280: on workerd a `/tmp` log file accepts writes, reads back,
// and reports a non-zero size — then loses everything when the isolate
// recycles. `statfs` is the one honest signal: it reports
// `blocks: 0, bsize: 0` there, and non-zero on every real filesystem.
describe({
  name: 'slogger.handlers.fileHandler - ephemeral filesystem',
  // `sys` is the permission Deno gates `statfs` behind. Granting it
  // here is what lets the real probe actually run: without it the
  // handler skips the check (silently, by design), and the
  // "must not warn about a real filesystem" test below would pass for
  // the wrong reason.
  permissions: { write: true, read: true, sys: true },
  fn: () => {
    beforeAll(async () => {
      await setup();
    });

    afterAll(async () => {
      await teardown();
    });

    it('a zero-capacity filesystem is the only positive', () => {
      asserts.assertEquals(
        isEphemeralFilesystem('/tmp/app.log', WORKERD_STATFS),
        true,
      );
    });

    it('a real filesystem is never flagged', () => {
      asserts.assertEquals(
        isEphemeralFilesystem('/var/log/app.log', REAL_STATFS),
        false,
      );
      // Only BOTH fields at zero is the ephemeral signature. A volume
      // with no free blocks, or a runtime that fills in just one of the
      // two, is a real filesystem and must stay silent.
      asserts.assertEquals(
        isEphemeralFilesystem('/x', () => ({ bsize: 4096, blocks: 0 })),
        false,
      );
      asserts.assertEquals(
        isEphemeralFilesystem('/x', () => ({ bsize: 0, blocks: 194009419 })),
        false,
      );
      // Belt and braces: the runtime's own `statfs`, no fake in the
      // way, against a directory that really exists.
      asserts.assertEquals(isEphemeralFilesystem(TEST_DIR), false);
    });

    it('no statfs, or a failing statfs, warns about nothing', () => {
      // `null` stands in for a runtime that exposes no `statfs` at all
      // — a missing probe must never produce a warning.
      asserts.assertEquals(isEphemeralFilesystem('/tmp/app.log', null), false);
      asserts.assertEquals(
        isEphemeralFilesystem('/tmp/gone.log', () => {
          throw new Error('ENOENT: no such file or directory');
        }),
        false,
      );
    });

    it('warns exactly once per handler, and still writes', async () => {
      const filename = 'ephemeral.log';
      await cleanupTestFile(filename);
      for (const f of await listTestFiles('ephemeral.log')) {
        await cleanupTestFile(f);
      }

      // The seam: pretend this handler's log file is on workerd's
      // filesystem. Nothing else about the handler changes.
      class EphemeralFileHandler extends FileHandler {
        protected override _isEphemeralFilesystem(): boolean {
          return isEphemeralFilesystem(this._logFile, WORKERD_STATFS);
        }
      }

      const handler = new EphemeralFileHandler('ephemeralHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        maxFileSizeBytes: 50, // tiny cap: a write forces a reopen
        formatter: simpleFormatter('${message}'),
      });

      const warnings = await captureWarnings(async () => {
        await handler.init();
        await handler.handle(makeLogObject(5, 'first'));
        // Overshoots the cap → rotation → a second `_openLogFile`.
        await handler.handle(makeLogObject(5, 'X'.repeat(80)));
        await handler.handle(makeLogObject(5, 'last'));
        await handler.finalize();
      });

      asserts.assertEquals(
        warnings.length,
        1,
        `expected exactly one warning, got: ${JSON.stringify(warnings)}`,
      );
      asserts.assertStringIncludes(warnings[0]!, 'ephemeralHandler');
      asserts.assertStringIncludes(warnings[0]!, 'MemoryHandler');

      // The warning changes nothing about the write path.
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      asserts.assertStringIncludes(content!, 'last');

      await cleanupTestFile(filename);
      for (const f of await listTestFiles('ephemeral.log')) {
        await cleanupTestFile(f);
      }
    });

    it('says nothing on a real filesystem', async () => {
      const filename = 'real-fs.log';
      await cleanupTestFile(filename);

      // No seam, no fake: the live runtime probe against the real
      // test directory. A warning here is the failure mode that
      // matters — a healthy log file called ephemeral.
      const handler = new FileHandler('realFsHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      const warnings = await captureWarnings(async () => {
        await handler.init();
        await handler.handle(makeLogObject(5, 'persisted'));
        await handler.finalize();
      });

      asserts.assertEquals(
        warnings.length,
        0,
        `real filesystem must not warn, got: ${JSON.stringify(warnings)}`,
      );
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      asserts.assertStringIncludes(content!, 'persisted');
      await cleanupTestFile(filename);
    });

    it('says nothing when the runtime has no statfs', async () => {
      const filename = 'no-statfs.log';
      await cleanupTestFile(filename);

      class NoStatfsFileHandler extends FileHandler {
        protected override _isEphemeralFilesystem(): boolean {
          return isEphemeralFilesystem(this._logFile, null);
        }
      }

      const handler = new NoStatfsFileHandler('noStatfsHandler', {
        level: 5,
        directory: TEST_DIR,
        filenameTemplate: filename,
        formatter: simpleFormatter('${message}'),
      });

      const warnings = await captureWarnings(async () => {
        await handler.init();
        await handler.handle(makeLogObject(5, 'still-written'));
        await handler.finalize();
      });

      asserts.assertEquals(warnings.length, 0);
      const content = await readTestFile(filename);
      asserts.assertNotEquals(content, null);
      asserts.assertStringIncludes(content!, 'still-written');
      await cleanupTestFile(filename);
    });
  },
});

describe({
  name: 'slogger.handlers.fileHandler - No Permission',
  permissions: { write: false, read: false },
  deno: true, // Permission checks only work in Deno
  bun: false,
  node: false,
  fn: () => {
    it('init - throws on permission error', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        directory: './no-permission-test/',
        filenameTemplate: 'noperm-test.log',
      });

      await asserts.assertRejects(
        () => handler.init(),
        Error,
      );
    });
  },
});
