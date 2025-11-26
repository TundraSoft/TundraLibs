import { FileHandler, type FileHandlerOptions } from './mod.ts';
import * as asserts from '$asserts';
import { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
import { SlogObject } from '../../types/mod.ts';
import * as path from '$path';
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

// Test directory for file handler (using fixtures)
const TEST_DIR = './slogger/handlers/handler/fixtures/file/';

// Setup and teardown for tests
async function setup() {
  try {
    await Deno.mkdir(TEST_DIR, { recursive: true });
  } catch (e) {
    console.error(`Error creating test directory: ${(e as Error).message}`);
  }
}

async function teardown() {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch (e) {
    console.error(`Error removing test directory: ${(e as Error).message}`);
  }
}

// Helper to clean up specific test files
async function cleanupTestFile(filename: string) {
  try {
    await Deno.remove(path.join(TEST_DIR, filename));
  } catch {
    // File might not exist
  }
}

// Helper to check if file exists and get its content
async function readTestFile(filename: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path.join(TEST_DIR, filename));
  } catch {
    return null;
  }
}

// Helper to get file info
async function getTestFileInfo(
  filename: string,
): Promise<Deno.FileInfo | null> {
  try {
    return await Deno.stat(path.join(TEST_DIR, filename));
  } catch {
    return null;
  }
}

// Helper to list files in test directory
async function listTestFiles(pattern?: string): Promise<string[]> {
  try {
    const files: string[] = [];
    for await (const entry of Deno.readDir(TEST_DIR)) {
      if (entry.isFile && (!pattern || entry.name.includes(pattern))) {
        files.push(entry.name);
      }
    }
    return files;
  } catch {
    return [];
  }
}

Deno.test({
  name: 'slogger.handlers.fileHandler',
  permissions: { write: true, read: true },
}, async (t) => {
  await setup();

  try {
    await t.step('constructor - valid options', () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'test.log',
        maxFileSize: 10, // 10MB
        bufferSize: 4096,
      });

      asserts.assertEquals(handler.name, 'testHandler');
      asserts.assertEquals(handler.level, 5);
      asserts.assertEquals(handler.mode, 'file');
    });

    await t.step('constructor - invalid options', async (u) => {
      await u.step('missing storePath', () => {
        asserts.assertThrows(
          // @ts-ignore - Testing missing storePath
          () =>
            new FileHandler('testHandler', {
              level: 5,
              fileName: 'test.log',
            } as FileHandlerOptions),
          Error,
          'valid storePath',
        );
      });

      await u.step('missing fileName', () => {
        asserts.assertThrows(
          // @ts-ignore - Testing missing fileName
          () =>
            new FileHandler('testHandler', {
              level: 5,
              storePath: TEST_DIR,
            } as FileHandlerOptions),
          Error,
          'valid fileName',
        );
      });

      await u.step('invalid maxFileSize', () => {
        asserts.assertThrows(
          () =>
            new FileHandler('testHandler', {
              level: 5,
              storePath: TEST_DIR,
              fileName: 'test.log',
              maxFileSize: -1, // negative size
            }),
          Error,
          'positive maxFileSize',
        );
      });

      await u.step('invalid bufferSize', () => {
        asserts.assertThrows(
          () =>
            new FileHandler('testHandler', {
              level: 5,
              storePath: TEST_DIR,
              fileName: 'test.log',
              bufferSize: -1, // negative size
            }),
          Error,
          'positive number',
        );
      });
    });

    await t.step('init - creates file handle and directory', async () => {
      const filename = 'init-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
      });

      await handler.init();
      await handler.finalize();

      // Check that directory exists
      const dirInfo = await Deno.stat(TEST_DIR);
      asserts.assertEquals(dirInfo.isDirectory, true);

      // Check that file was created (even if empty)
      const fileInfo = await getTestFileInfo(filename);
      asserts.assertNotEquals(fileInfo, null);
      asserts.assertEquals(fileInfo!.isFile, true);
    });

    await t.step('handle - writes log to file', async () => {
      const filename = 'handle-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
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

    await t.step('handle - flushes on high severity', async () => {
      const filename = 'severity-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
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

    await t.step('handle large messages - direct write', async () => {
      const filename = 'large-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        bufferSize: 100, // Small buffer to test direct write
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

    await t.step('handle - buffer overflow and flush', async () => {
      const filename = 'buffer-test.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        bufferSize: 50, // Small buffer
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

    await t.step('file rotation - max size exceeded', async () => {
      const filename = 'rotation-test.log';
      await cleanupTestFile(filename);

      // Clean up any potential rotated files
      const existingFiles = await listTestFiles('rotation-test');
      for (const file of existingFiles) {
        await cleanupTestFile(file);
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        maxFileSize: 0.001, // Very small (1KB) to trigger rotation
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

    await t.step('error handling - uninitialized handler', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'error-test.log',
        formatter: simpleFormatter('${message}'),
      });

      // Don't call init - this should cause the error when trying to handle a message
      await asserts.assertRejects(
        () => handler.handle(makeLogObject(5, 'Test message')),
        Error,
        'FileHandler not initialized',
      );
    });

    await t.step('error handling - double finalize', async () => {
      const filename = 'double-finalize.log';
      await cleanupTestFile(filename);

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();
      await handler.finalize();

      // Second finalize should not throw
      await handler.finalize();
    });

    await t.step('variable replacement in paths', async () => {
      const testDirWithVar = path.join(TEST_DIR, 'testHandler-logs');

      // Clean up test directory
      try {
        await Deno.remove(testDirWithVar, { recursive: true });
      } catch {
        // Directory might not exist
      }

      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: path.join(TEST_DIR, '${name}-logs'),
        fileName: '${name}-${date}.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      await handler.handle(makeLogObject(5, 'Variable test message'));
      await handler.finalize();

      // Check that directory with variable was created
      const dirInfo = await Deno.stat(testDirWithVar);
      asserts.assertEquals(dirInfo.isDirectory, true);

      // Find the log file (with date in filename)
      const files: string[] = [];
      for await (const entry of Deno.readDir(testDirWithVar)) {
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
        const content = await Deno.readTextFile(
          path.join(testDirWithVar, logFileName),
        );
        asserts.assert(content.includes('Variable test message'));
      }

      // Clean up
      await Deno.remove(testDirWithVar, { recursive: true });
    });

    await t.step('existing file size detection on init', async () => {
      const filename = 'existing-size.log';
      await cleanupTestFile(filename);

      // First create a file with some content
      const handler1 = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        formatter: simpleFormatter('${message}'),
      });

      await handler1.init();
      await handler1.handle(makeLogObject(5, 'Initial data'));
      await handler1.finalize();

      // Now create a new handler with very small max size to trigger rotation
      const handler2 = new FileHandler('testHandler2', {
        level: 5,
        storePath: TEST_DIR,
        fileName: filename,
        maxFileSize: 0.0001, // Very small to trigger rotation
      });

      await handler2.init(); // Should detect existing size and rotate if needed
      await handler2.finalize();

      // File should still exist
      const fileInfo = await getTestFileInfo(filename);
      asserts.assertNotEquals(fileInfo, null);
    });
  } finally {
    await teardown();
  }
});

Deno.test({
  name: 'slogger.handlers.fileHandler - No Permission',
  permissions: { write: false, read: false },
}, async (t) => {
  await t.step('init - throws on permission error', async () => {
    const handler = new FileHandler('testHandler', {
      level: 5,
      storePath: './no-permission-test/',
      fileName: 'noperm-test.log',
    });

    await asserts.assertRejects(
      () => handler.init(),
      Error,
      'Permission denied',
    );
  });
});
