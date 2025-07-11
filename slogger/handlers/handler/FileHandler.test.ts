import { FileHandler } from './mod.ts';
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

// Create a test directory for file handler
const TEST_DIR = './slogger/handlers/handler/fixtures/file/';

// Mock file operations
class MockFile {
  private readonly data: string[] = [];
  public closed = false;

  writeSync(data: Uint8Array): number {
    const text = new TextDecoder().decode(data);
    this.data.push(text);
    return data.length;
  }

  async write(data: Uint8Array): Promise<number> {
    const text = new TextDecoder().decode(data);
    this.data.push(text);
    return Promise.resolve(data.length);
  }

  async sync(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }

  getWrittenData(): string {
    return this.data.join('');
  }
}

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

Deno.test({
  name: 'Slogger.Handlers.FileHandler',
  permissions: { write: true, read: true },
}, async (t) => {
  await setup();

  const originalOpen = Deno.open;
  const mockFiles: Record<string, MockFile> = {};

  // Mock Deno.open
  Deno.open = async (
    filePath: string | URL,
    _options?: Deno.OpenOptions,
  ): Promise<Deno.FsFile> => {
    await Promise.resolve(); // Simulate async operation
    const path = filePath.toString();
    mockFiles[path] = new MockFile();
    // @ts-ignore - We're mocking the FsFile interface
    return mockFiles[path];
  };

  // Mock Deno.stat to always return size 0
  const originalStat = Deno.stat;
  Deno.stat = async (_path: string | URL): Promise<Deno.FileInfo> => {
    await Promise.resolve(); // Simulate async operation
    return {
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: 0,
      mtime: new Date(),
      atime: new Date(),
      birthtime: new Date(),
      dev: 0,
      ino: 0,
      mode: 0,
      nlink: 0,
      uid: 0,
      gid: 0,
      rdev: 0,
      blksize: 0,
      blocks: 0,
    } as Deno.FileInfo;
  };

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

    await t.step('constructor - invalid options', async (t) => {
      await t.step('missing storePath', () => {
        asserts.assertThrows(
          // @ts-ignore - Testing missing storePath
          () =>
            new FileHandler('testHandler', {
              level: 5,
              fileName: 'test.log',
            } as any),
          Error,
          'valid storePath',
        );
      });

      await t.step('missing fileName', () => {
        asserts.assertThrows(
          // @ts-ignore - Testing missing fileName
          () =>
            new FileHandler('testHandler', {
              level: 5,
              storePath: TEST_DIR,
            } as any),
          Error,
          'valid fileName',
        );
      });

      await t.step('invalid maxFileSize', () => {
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

      await t.step('invalid bufferSize', () => {
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

    await t.step('init - creates file handle', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'init-test.log',
      });

      await handler.init();
      const expectedPath = path.join(TEST_DIR, 'init-test.log');

      // Check that file was created
      asserts.assert(mockFiles[expectedPath] !== undefined);
    });

    await t.step('handle - writes log to buffer', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'handle-test.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // We need to check the private buffer directly or modify our approach
      // Since we can't easily check the internal buffer state, we'll verify
      // our mock file has no writes yet, and data is only written after finalize

      const expectedPath = path.join(TEST_DIR, 'handle-test.log');

      // Record initial state (should be empty)
      const initialData = mockFiles[expectedPath]?.getWrittenData() || '';

      // Handle a log entry
      await handler.handle(makeLogObject(5, 'Test message'));

      // For WARNING level (5), the buffer should not be flushed yet
      // Let's give any async operations a chance to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check that no new data is written (still in buffer)
      const afterHandleData = mockFiles[expectedPath]?.getWrittenData() || '';
      asserts.assertEquals(
        afterHandleData,
        initialData,
        'Buffer should not be flushed yet after handling a WARNING level message',
      );

      // Now finalize - this should flush the buffer
      handler.finalize();

      // Check that data is now written
      const finalData = mockFiles[expectedPath]?.getWrittenData() || '';
      asserts.assert(
        finalData.includes('Test message'),
        'Message should be written to file after finalize',
      );
    });

    await t.step('handle - flushes on high severity', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'severity-test.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Send a low severity message (should stay in buffer)
      await handler.handle(makeLogObject(5, 'Low severity'));

      // Send a high severity message (ERROR level)
      await handler.handle(makeLogObject(3, 'High severity'));

      const expectedPath = path.join(TEST_DIR, 'severity-test.log');

      // Buffer should have been flushed after ERROR message
      const mockFile = mockFiles[expectedPath];
      asserts.assert(mockFile !== undefined, 'Mock file should exist');
      const fileContent = mockFile.getWrittenData();
      asserts.assert(fileContent.includes('Low severity'));
      asserts.assert(fileContent.includes('High severity'));

      await handler.finalize();
    });

    await t.step('finalize - closes file handle', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'finalize-test.log',
      });

      await handler.init();

      const expectedPath = path.join(TEST_DIR, 'finalize-test.log');
      const mockFile = mockFiles[expectedPath];
      asserts.assert(mockFile !== undefined, 'Mock file should exist');
      asserts.assertEquals(mockFile.closed, false);

      await handler.finalize();
      asserts.assertEquals(mockFile.closed, true);
    });

    await t.step('handle large messages - direct write', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'large-test.log',
        bufferSize: 100, // Small buffer to test direct write
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Create a message larger than buffer size
      const largeMessage = 'x'.repeat(150);
      await handler.handle(makeLogObject(5, largeMessage));

      const expectedPath = path.join(TEST_DIR, 'large-test.log');
      const mockFile = mockFiles[expectedPath];
      asserts.assert(mockFile !== undefined, 'Mock file should exist');
      const fileContent = mockFile.getWrittenData();
      asserts.assert(fileContent.includes(largeMessage));

      await handler.finalize();
    });

    await t.step('handle - buffer overflow and flush', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'buffer-test.log',
        bufferSize: 50, // Small buffer
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Send multiple messages to overflow buffer
      await handler.handle(makeLogObject(5, 'First message'));
      await handler.handle(makeLogObject(5, 'Second message'));
      await handler.handle(makeLogObject(5, 'Third message'));

      await handler.finalize();

      const expectedPath = path.join(TEST_DIR, 'buffer-test.log');
      const mockFile = mockFiles[expectedPath];
      asserts.assert(mockFile !== undefined, 'Mock file should exist');
      const fileContent = mockFile.getWrittenData();

      asserts.assert(fileContent.includes('First message'));
      asserts.assert(fileContent.includes('Second message'));
      asserts.assert(fileContent.includes('Third message'));
    });

    await t.step('file rotation - max size exceeded', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'rotation-test.log',
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

      const expectedPath = path.join(TEST_DIR, 'rotation-test.log');
      asserts.assert(mockFiles[expectedPath] !== undefined);
    });

    await t.step('error handling - uninitialized handler', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'error-test.log',
        formatter: simpleFormatter('${message}'),
      });

      // Don't call init - this should cause the error when trying to handle a message
      try {
        await handler.handle(makeLogObject(5, 'Test message'));
        asserts.fail('Expected error to be thrown');
      } catch (error) {
        asserts.assert(error instanceof Error);
        asserts.assert(error.message.includes('FileHandler not initialized'));
      }
    });

    await t.step('error handling - double finalize', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'double-finalize.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();
      await handler.finalize();

      // Second finalize should not throw
      await handler.finalize();
    });

    await t.step('constructor - custom buffer size validation', async (t) => {
      await t.step('default buffer size', () => {
        const handler = new FileHandler('testHandler', {
          level: 5,
          storePath: TEST_DIR,
          fileName: 'default-buffer.log',
        });

        // @ts-ignore - Accessing protected property for testing
        asserts.assertEquals(handler._bufferSize, 4096);
      });

      await t.step('custom buffer size', () => {
        const handler = new FileHandler('testHandler', {
          level: 5,
          storePath: TEST_DIR,
          fileName: 'custom-buffer.log',
          bufferSize: 8192,
        });

        // @ts-ignore - Accessing protected property for testing
        asserts.assertEquals(handler._bufferSize, 8192);
      });
    });

    await t.step('variable replacement in paths', () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: path.join(TEST_DIR, '${date}'),
        fileName: '${name}.log',
      });

      // @ts-ignore - Accessing protected property for testing
      asserts.assert(handler._logFile.includes('testHandler.log'));
      // @ts-ignore - Accessing protected property for testing
      asserts.assertEquals(handler._storePath, path.join(TEST_DIR, '${date}'));
    });

    await t.step('existing file size detection on init', async () => {
      // First create a handler and write some data
      const handler1 = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'existing-size.log',
        formatter: simpleFormatter('${message}'),
      });

      await handler1.init();
      await handler1.handle(makeLogObject(5, 'Initial data'));
      await handler1.finalize();

      // Mock Deno.stat to return a size > 0
      const originalStat = Deno.stat;
      Deno.stat = async (_path: string | URL): Promise<Deno.FileInfo> => {
        return {
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          size: 1000, // Simulate existing file size
          mtime: new Date(),
          atime: new Date(),
          birthtime: new Date(),
          dev: 0,
          ino: 0,
          mode: 0,
          nlink: 0,
          uid: 0,
          gid: 0,
          rdev: 0,
          blksize: 0,
          blocks: 0,
        } as Deno.FileInfo;
      };

      try {
        const handler2 = new FileHandler('testHandler2', {
          level: 5,
          storePath: TEST_DIR,
          fileName: 'existing-size2.log',
          maxFileSize: 0.0001, // Very small to trigger rotation
        });

        await handler2.init(); // Should detect existing size and rotate immediately
        await handler2.finalize();
      } finally {
        Deno.stat = originalStat;
      }
    });

    await t.step('rotation file rename error handling', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'rename-error.log',
        maxFileSize: 0.001, // Very small to trigger rotation
        formatter: simpleFormatter('${message}'),
      });

      await handler.init();

      // Mock Deno.rename to throw an error
      const originalRename = Deno.rename;
      Deno.rename = async (
        _from: string | URL,
        _to: string | URL,
      ): Promise<void> => {
        throw new Error('Rename failed');
      };

      // Create console.error spy to verify error is logged
      const originalConsoleError = console.error;
      let errorLogged = false;
      console.error = (message: unknown) => {
        if (
          typeof message === 'string' &&
          message.includes('Failed to rotate log file')
        ) {
          errorLogged = true;
        }
      };

      try {
        // Send data to trigger rotation
        const bigMessage = 'x'.repeat(500);
        await handler.handle(makeLogObject(5, bigMessage));
        await handler.handle(makeLogObject(5, bigMessage));
        await handler.handle(makeLogObject(5, bigMessage));

        // Verify error was logged
        asserts.assert(errorLogged, 'Rotation error should be logged');
      } finally {
        Deno.rename = originalRename;
        console.error = originalConsoleError;
        await handler.finalize();
      }
    });

    await t.step('finalize with no file handle', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'no-handle.log',
      });

      // Don't call init, so no file handle exists
      await handler.finalize(); // Should not throw
    });
  } finally {
    // Restore original functions
    Deno.open = originalOpen;
    Deno.stat = originalStat;
    await teardown();
  }
});

Deno.test({
  name: 'Slogger.Handlers.FileHandler - No Permission',
  permissions: { write: false, read: false },
}, async (t) => {
  await setup();

  await t.step('init - throws on permission error', async () => {
    const handler = new FileHandler('testHandler', {
      level: 5,
      storePath: TEST_DIR,
      fileName: 'noperm-test.log',
    });

    await asserts.assertRejects(
      () => handler.init(),
      Error,
      'Permission denied',
    );
  });

  await teardown();
});
