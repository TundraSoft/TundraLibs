import { mock } from '../dev.dependencies.ts';
import { loadHooks } from './gitHooks.ts';

// Mock Deno APIs
const readDirMock = mock.spy(async function* (path: string | URL) {
  if (typeof path === 'string' || path instanceof URL) {
    yield { isFile: true, name: 'pre-commit' } as Deno.DirEntry;
    yield { isFile: true, name: 'commit-msg' } as Deno.DirEntry;
    yield { isFile: false, name: 'not-a-hook' } as Deno.DirEntry; // This should be ignored
  }
});

const readTextFileMock = mock.spy(
  async (_path: string | URL, _options?: Deno.ReadFileOptions) => {
    await 1;
    return 'mock file content';
  },
);
const removeMock = mock.spy(
  async (_path: string | URL, _options?: Deno.RemoveOptions) => {},
);
const writeFileMock = mock.spy(
  async (
    _path: string | URL,
    _data: string | ReadableStream<string>,
    _options?: Deno.WriteFileOptions,
  ) => {},
);
const chmodMock = mock.spy(async (_path: string | URL, _mode: number) => {});

// Replace Deno's functions with mocks
Deno.readDir = readDirMock;
Deno.readTextFile = readTextFileMock;
Deno.remove = removeMock;
Deno.writeTextFile = writeFileMock;
Deno.chmod = chmodMock;

Deno.test('loadHooks processes valid hooks correctly', async () => {
  await loadHooks('test/hooks');

  // Verify that readDir was called with the correct path
  mock.assertSpyCall(readDirMock, 0, {
    args: ['test/hooks'],
  });

  // Verify that readTextFile, remove, writeTextFile, and chmod were called for valid hooks
  const expectedHooks = ['pre-commit', 'commit-msg'];
  for (const hookName of expectedHooks) {
    const hookPath = `test/hooks/${hookName}`;
    const gitHookPath = `.git/hooks/${hookName}`;

    // Check readTextFile was called with correct path
    mock.assertSpyCalls(readTextFileMock, 2); // Two valid hooks
    mock.assertSpyCall(readTextFileMock, expectedHooks.indexOf(hookName), {
      args: [hookPath],
    });

    // Check remove, writeTextFile, and chmod were called with correct paths and arguments
    mock.assertSpyCall(removeMock, expectedHooks.indexOf(hookName), {
      args: [gitHookPath],
    });
    mock.assertSpyCall(writeFileMock, expectedHooks.indexOf(hookName), {
      args: [gitHookPath, 'mock file content'],
    });
    mock.assertSpyCall(chmodMock, expectedHooks.indexOf(hookName), {
      args: [gitHookPath, 0o755],
    });
  }
});
