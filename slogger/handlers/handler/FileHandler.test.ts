// deno-lint-ignore-file no-explicit-any
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
  private data: string[] = [];
  public closed = false;

  writeSync(data: Uint8Array): number {
    const text = new TextDecoder().decode(data);
    this.data.push(text);
    return data.length;
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
    await 1; // Simulate async operation
    const path = filePath.toString();
    mockFiles[path] = new MockFile();
    // @ts-ignore - We're mocking the FsFile interface
    return mockFiles[path];
  };

  // Mock Deno.stat to always return size 0
  const originalStat = Deno.stat;
  Deno.stat = async (_path: string | URL): Promise<Deno.FileInfo> => {
    await 1; // Simulate async operation
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
      const fileContent = mockFiles[expectedPath]!.getWrittenData();
      asserts.assert(fileContent.includes('Low severity'));
      asserts.assert(fileContent.includes('High severity'));

      handler.finalize();
    });

    await t.step('finalize - closes file handle', async () => {
      const handler = new FileHandler('testHandler', {
        level: 5,
        storePath: TEST_DIR,
        fileName: 'finalize-test.log',
      });

      await handler.init();

      const expectedPath = path.join(TEST_DIR, 'finalize-test.log');
      asserts.assertEquals(mockFiles[expectedPath]!.closed, false);

      handler.finalize();
      asserts.assertEquals(mockFiles[expectedPath]!.closed, true);
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
    await asserts.assertThrows(
      () => {
        new FileHandler('testHandler', {
          level: 5,
          storePath: TEST_DIR,
          fileName: 'noperm-test.log',
        });
      },
      Error,
      'Permission denied',
    );
  });

  await teardown();
});
