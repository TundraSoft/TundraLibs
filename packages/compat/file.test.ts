import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import * as path from './path.ts';
import { cwd } from './runtime.ts';
import {
  copyDir,
  copyDirSync,
  copyFile,
  copyFileSync,
  deleteFile,
  deleteFileSync,
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  FileAlreadyExists,
  FileInvalidPath,
  FileNotFound,
  // Error classes
  FileOperationError,
  FileTypeMismatch,
  // URL conversion
  fromFileUrl,
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  makeDir,
  makeDirSync,
  makeTempDir,
  makeTempDirSync,
  makeTempFile,
  makeTempFileSync,
  moveDir,
  moveDirSync,
  moveFile,
  moveFileSync,
  // File handle operations
  openFile,
  openFileSync,
  // Existence checks
  pathExists,
  pathExistsSync,
  // Directory operations
  readDir,
  readDirSync,
  // File operations
  readFile,
  readFileStream,
  readFileSync,
  readJSONFile,
  readJSONFileSync,
  readTextFile,
  readTextFileSync,
  // Helpers
  remove,
  removeDir,
  removeDirSync,
  removeSync,
  renameDir,
  renameDirSync,
  renameFile,
  renameFileSync,
  // Metadata operations
  stat,
  statSync,
  toFileUrl,
  writeFile,
  writeFileSync,
  writeJSONFile,
  writeJSONFileSync,
  writeTextFile,
  writeTextFileSync,
} from './file.ts';

const fixturesDir = path.join(cwd(), 'packages/compat/fixtures');

describe({
  name: 'compat.file - Existence checks on a missing path',
  fn: () => {
    // Regression: on Deno these returned FileNotFound instead of false. The
    // not-found branch checked `.code === 'NotFound'`, but Deno's error carries
    // `.name === 'NotFound'` / `.code === 'ENOENT'`, so it never matched and
    // fell through to throw. Every runtime must return false, never throw.
    const missing = path.join(fixturesDir, 'definitely-missing-path-xyz-987');

    it('isFile returns false, does not throw', async () => {
      asserts.assertEquals(await isFile(missing), false);
    });
    it('isFileSync returns false, does not throw', () => {
      asserts.assertEquals(isFileSync(missing), false);
    });
    it('isDirectory returns false, does not throw', async () => {
      asserts.assertEquals(await isDirectory(missing), false);
    });
    it('isDirectorySync returns false, does not throw', () => {
      asserts.assertEquals(isDirectorySync(missing), false);
    });
    it('pathExists returns false, does not throw', async () => {
      asserts.assertEquals(await pathExists(missing), false);
    });
    it('pathExistsSync returns false, does not throw', () => {
      asserts.assertEquals(pathExistsSync(missing), false);
    });
  },
});

describe({
  name: 'compat.file - Directory Operations',
  fn: () => {
    describe('makeDir / makeDirSync', () => {
      it('should create a directory', async () => {
        const testDir = path.join(fixturesDir, 'new-dir-' + Date.now());

        await makeDir(testDir, { recursive: true });
        asserts.assert(await pathExists(testDir), 'Directory should exist');
        asserts.assert(
          await isDirectory(testDir),
          'Path should be a directory',
        );

        await removeDir(testDir);
      });

      it('should create a directory synchronously', () => {
        const testDir = path.join(fixturesDir, 'new-dir-sync-' + Date.now());

        makeDirSync(testDir, { recursive: true });
        asserts.assert(pathExistsSync(testDir), 'Directory should exist');
        asserts.assert(isDirectorySync(testDir), 'Path should be a directory');

        removeDirSync(testDir);
      });

      it('should create nested directories with recursive option', async () => {
        const testDir = path.join(
          fixturesDir,
          'nested',
          'deep',
          'dir-' + Date.now(),
        );

        await makeDir(testDir, { recursive: true });
        asserts.assert(
          await pathExists(testDir),
          'Nested directory should exist',
        );

        await removeDir(path.join(fixturesDir, 'nested'), { recursive: true });
      });

      it('should throw FileAlreadyExists if directory exists', async () => {
        const testDir = path.join(fixturesDir, 'existing-dir-' + Date.now());

        await makeDir(testDir);

        await asserts.assertRejects(
          async () => await makeDir(testDir),
          FileAlreadyExists,
        );

        await removeDir(testDir);
      });
    });

    describe('readDir / readDirSync', () => {
      it('should read directory contents', async () => {
        const testDir = path.join(fixturesDir, 'read-dir-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file1.txt'), 'content');
        await writeTextFile(path.join(testDir, 'file2.txt'), 'content');
        await makeDir(path.join(testDir, 'subdir'));

        const entries = [];
        for await (const entry of readDir(testDir)) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 3, 'Should have 3 entries');
        const names = entries.map((e) => e.name).sort((a, b) =>
          a.localeCompare(b)
        );
        asserts.assertEquals(names, ['file1.txt', 'file2.txt', 'subdir']);

        const fileEntry = entries.find((e) => e.name === 'file1.txt');
        asserts.assert(fileEntry?.isFile, 'file1.txt should be a file');
        asserts.assert(
          !fileEntry?.isDirectory,
          'file1.txt should not be a directory',
        );

        const dirEntry = entries.find((e) => e.name === 'subdir');
        asserts.assert(dirEntry?.isDirectory, 'subdir should be a directory');
        asserts.assert(!dirEntry?.isFile, 'subdir should not be a file');

        await removeDir(testDir, { recursive: true });
      });

      it('should read directory contents synchronously', () => {
        const testDir = path.join(fixturesDir, 'read-dir-sync-' + Date.now());
        makeDirSync(testDir);
        writeTextFileSync(path.join(testDir, 'file1.txt'), 'content');
        makeDirSync(path.join(testDir, 'subdir'));

        const entries = [];
        for (const entry of readDirSync(testDir)) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 2, 'Should have 2 entries');

        removeDirSync(testDir, { recursive: true });
      });

      it('should throw FileNotFound for non-existent directory', async () => {
        await asserts.assertRejects(
          async () => {
            for await (const _ of readDir('/non-existent-dir-12345')) {
              // Should not reach here
            }
          },
          FileNotFound,
        );
      });

      it('should filter by includeFiles option', async () => {
        const testDir = path.join(fixturesDir, 'filter-files-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file1.txt'), 'content');
        await makeDir(path.join(testDir, 'subdir'));

        const entries = [];
        for await (
          const entry of readDir(testDir, { includeFiles: false })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 1, 'Should have 1 entry');
        asserts.assertEquals(entries[0]!.name, 'subdir');
        asserts.assert(entries[0]!.isDirectory);

        await removeDir(testDir, { recursive: true });
      });

      it('should filter by includeDirs option', async () => {
        const testDir = path.join(fixturesDir, 'filter-dirs-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file1.txt'), 'content');
        await makeDir(path.join(testDir, 'subdir'));

        const entries = [];
        for await (
          const entry of readDir(testDir, { includeDirs: false })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 1, 'Should have 1 entry');
        asserts.assertEquals(entries[0]?.name, 'file1.txt');
        asserts.assert(entries[0]?.isFile);

        await removeDir(testDir, { recursive: true });
      });

      it('should filter by file extensions', async () => {
        const testDir = path.join(fixturesDir, 'filter-exts-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file1.txt'), 'content');
        await writeTextFile(path.join(testDir, 'file2.ts'), 'content');
        await writeTextFile(path.join(testDir, 'file3.json'), 'content');

        const entries = [];
        for await (
          const entry of readDir(testDir, { exts: ['.ts', '.json'] })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 2, 'Should have 2 entries');
        const names = entries.map((e) => e.name).sort((a, b) =>
          a.localeCompare(b)
        );
        asserts.assertEquals(names, ['file2.ts', 'file3.json']);

        await removeDir(testDir, { recursive: true });
      });

      it('should filter by match patterns', async () => {
        const testDir = path.join(fixturesDir, 'filter-match-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'test1.txt'), 'content');
        await writeTextFile(path.join(testDir, 'prod.txt'), 'content');
        await writeTextFile(path.join(testDir, 'test2.txt'), 'content');

        const entries = [];
        for await (
          const entry of readDir(testDir, { match: [/^test/] })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 2, 'Should have 2 entries');
        const names = entries.map((e) => e.name).sort((a, b) =>
          a.localeCompare(b)
        );
        asserts.assertEquals(names, ['test1.txt', 'test2.txt']);

        await removeDir(testDir, { recursive: true });
      });

      it('should filter by skip patterns', async () => {
        const testDir = path.join(fixturesDir, 'filter-skip-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file.txt'), 'content');
        await writeTextFile(path.join(testDir, 'file.test.ts'), 'content');
        await writeTextFile(path.join(testDir, 'file.spec.ts'), 'content');

        const entries = [];
        for await (
          const entry of readDir(testDir, { skip: [/\.(test|spec)\./] })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 1, 'Should have 1 entry');
        asserts.assertEquals(entries[0]?.name, 'file.txt');

        await removeDir(testDir, { recursive: true });
      });

      it('should filter with combined options', async () => {
        const testDir = path.join(
          fixturesDir,
          'filter-combined-' + Date.now(),
        );
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'app.ts'), 'content');
        await writeTextFile(path.join(testDir, 'app.test.ts'), 'content');
        await writeTextFile(path.join(testDir, 'config.json'), 'content');
        await makeDir(path.join(testDir, 'subdir'));

        const entries = [];
        for await (
          const entry of readDir(testDir, {
            includeFiles: true,
            includeDirs: false,
            exts: ['.ts'],
            skip: [/\.test\./],
          })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 1, 'Should have 1 entry');
        asserts.assertEquals(entries[0]?.name, 'app.ts');

        await removeDir(testDir, { recursive: true });
      });

      it('should filter synchronously with options', () => {
        const testDir = path.join(
          fixturesDir,
          'filter-sync-' + Date.now(),
        );
        makeDirSync(testDir);
        writeTextFileSync(path.join(testDir, 'file.txt'), 'content');
        writeTextFileSync(path.join(testDir, 'file.ts'), 'content');
        makeDirSync(path.join(testDir, 'subdir'));

        const entries = [];
        for (
          const entry of readDirSync(testDir, {
            includeDirs: false,
            exts: ['.ts'],
          })
        ) {
          entries.push(entry);
        }

        asserts.assertEquals(entries.length, 1, 'Should have 1 entry');
        asserts.assertEquals(entries[0]?.name, 'file.ts');

        removeDirSync(testDir, { recursive: true });
      });
    });

    describe('removeDir / removeDirSync', () => {
      it('should remove an empty directory', async () => {
        const testDir = path.join(fixturesDir, 'remove-empty-' + Date.now());
        await makeDir(testDir);

        await removeDir(testDir);
        asserts.assert(
          !await pathExists(testDir),
          'Directory should be removed',
        );
      });

      it('should remove a directory recursively', async () => {
        const testDir = path.join(
          fixturesDir,
          'remove-recursive-' + Date.now(),
        );
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file.txt'), 'content');
        await makeDir(path.join(testDir, 'subdir'));
        await writeTextFile(
          path.join(testDir, 'subdir', 'nested.txt'),
          'content',
        );

        await removeDir(testDir, { recursive: true });
        asserts.assert(
          !await pathExists(testDir),
          'Directory should be removed',
        );
      });

      it('should remove directory synchronously', () => {
        const testDir = path.join(fixturesDir, 'remove-sync-' + Date.now());
        makeDirSync(testDir);

        removeDirSync(testDir);
        asserts.assert(!pathExistsSync(testDir), 'Directory should be removed');
      });

      it('should throw error when removing non-empty directory without recursive', async () => {
        const testDir = path.join(fixturesDir, 'remove-nonempty-' + Date.now());
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file.txt'), 'content');

        await asserts.assertRejects(
          async () => await removeDir(testDir),
          FileOperationError,
        );

        await removeDir(testDir, { recursive: true });
      });
    });

    describe('copyDir / copyDirSync', () => {
      it('should copy directory recursively', async () => {
        const srcDir = path.join(fixturesDir, 'copy-src-' + Date.now());
        const destDir = path.join(fixturesDir, 'copy-dest-' + Date.now());

        await makeDir(srcDir);
        await writeTextFile(path.join(srcDir, 'file1.txt'), 'content1');
        await writeTextFile(path.join(srcDir, 'file2.txt'), 'content2');
        await makeDir(path.join(srcDir, 'subdir'));
        await writeTextFile(
          path.join(srcDir, 'subdir', 'nested.txt'),
          'nested content',
        );

        await copyDir(srcDir, destDir);

        asserts.assert(await pathExists(destDir), 'Destination should exist');
        asserts.assert(
          await isFile(path.join(destDir, 'file1.txt')),
          'file1.txt should exist',
        );
        asserts.assert(
          await isFile(path.join(destDir, 'file2.txt')),
          'file2.txt should exist',
        );
        asserts.assert(
          await isDirectory(path.join(destDir, 'subdir')),
          'subdir should exist',
        );
        asserts.assert(
          await isFile(path.join(destDir, 'subdir', 'nested.txt')),
          'nested.txt should exist',
        );

        const content = await readTextFile(
          path.join(destDir, 'subdir', 'nested.txt'),
        );
        asserts.assertEquals(content, 'nested content', 'Content should match');

        await removeDir(srcDir, { recursive: true });
        await removeDir(destDir, { recursive: true });
      });

      it('should copy directory synchronously', () => {
        const srcDir = path.join(fixturesDir, 'copy-sync-src-' + Date.now());
        const destDir = path.join(fixturesDir, 'copy-sync-dest-' + Date.now());

        makeDirSync(srcDir);
        writeTextFileSync(path.join(srcDir, 'file.txt'), 'content');
        makeDirSync(path.join(srcDir, 'subdir'));

        copyDirSync(srcDir, destDir);

        asserts.assert(pathExistsSync(destDir), 'Destination should exist');
        asserts.assert(
          isFileSync(path.join(destDir, 'file.txt')),
          'file.txt should exist',
        );
        asserts.assert(
          isDirectorySync(path.join(destDir, 'subdir')),
          'subdir should exist',
        );

        removeDirSync(srcDir, { recursive: true });
        removeDirSync(destDir, { recursive: true });
      });

      it('should throw FileAlreadyExists when destination exists without overwrite', async () => {
        const srcDir = path.join(fixturesDir, 'copy-exists-src-' + Date.now());
        const destDir = path.join(
          fixturesDir,
          'copy-exists-dest-' + Date.now(),
        );

        await makeDir(srcDir);
        await writeTextFile(path.join(srcDir, 'file.txt'), 'original');

        await makeDir(destDir);
        await writeTextFile(path.join(destDir, 'file.txt'), 'existing');

        await asserts.assertRejects(
          async () => await copyDir(srcDir, destDir),
          FileAlreadyExists,
        );

        await removeDir(srcDir, { recursive: true });
        await removeDir(destDir, { recursive: true });
      });

      it('should overwrite existing files when overwrite option is true', async () => {
        const srcDir = path.join(
          fixturesDir,
          'copy-overwrite-src-' + Date.now(),
        );
        const destDir = path.join(
          fixturesDir,
          'copy-overwrite-dest-' + Date.now(),
        );

        await makeDir(srcDir);
        await writeTextFile(path.join(srcDir, 'file.txt'), 'new content');

        await makeDir(destDir);
        await writeTextFile(path.join(destDir, 'file.txt'), 'old content');

        await copyDir(srcDir, destDir, { overwrite: true });

        const content = await readTextFile(path.join(destDir, 'file.txt'));
        asserts.assertEquals(
          content,
          'new content',
          'Content should be overwritten',
        );

        await removeDir(srcDir, { recursive: true });
        await removeDir(destDir, { recursive: true });
      });
    });

    describe('moveDir / moveDirSync', () => {
      it('should move directory', async () => {
        const srcDir = path.join(fixturesDir, 'move-src-' + Date.now());
        const destDir = path.join(fixturesDir, 'move-dest-' + Date.now());

        await makeDir(srcDir);
        await writeTextFile(path.join(srcDir, 'file.txt'), 'content');

        await moveDir(srcDir, destDir);

        asserts.assert(!await pathExists(srcDir), 'Source should not exist');
        asserts.assert(await pathExists(destDir), 'Destination should exist');
        asserts.assert(
          await isFile(path.join(destDir, 'file.txt')),
          'file.txt should exist in destination',
        );

        await removeDir(destDir, { recursive: true });
      });

      it('should move directory synchronously', () => {
        const srcDir = path.join(fixturesDir, 'move-sync-src-' + Date.now());
        const destDir = path.join(fixturesDir, 'move-sync-dest-' + Date.now());

        makeDirSync(srcDir);
        writeTextFileSync(path.join(srcDir, 'file.txt'), 'content');

        moveDirSync(srcDir, destDir);

        asserts.assert(!pathExistsSync(srcDir), 'Source should not exist');
        asserts.assert(pathExistsSync(destDir), 'Destination should exist');

        removeDirSync(destDir, { recursive: true });
      });
    });

    describe('renameDir / renameDirSync', () => {
      it('should rename directory', async () => {
        const parentDir = path.join(fixturesDir, 'rename-parent-' + Date.now());
        await makeDir(parentDir);

        const oldDir = path.join(parentDir, 'oldname');
        await makeDir(oldDir);
        await writeTextFile(path.join(oldDir, 'file.txt'), 'content');

        await renameDir(oldDir, 'newname');

        const newDir = path.join(parentDir, 'newname');
        asserts.assert(
          !await pathExists(oldDir),
          'Old directory should not exist',
        );
        asserts.assert(await pathExists(newDir), 'New directory should exist');
        asserts.assert(
          await isFile(path.join(newDir, 'file.txt')),
          'file.txt should exist',
        );

        await removeDir(parentDir, { recursive: true });
      });

      it('should rename directory synchronously', () => {
        const parentDir = path.join(
          fixturesDir,
          'rename-sync-parent-' + Date.now(),
        );
        makeDirSync(parentDir);

        const oldDir = path.join(parentDir, 'oldname');
        makeDirSync(oldDir);

        renameDirSync(oldDir, 'newname');

        const newDir = path.join(parentDir, 'newname');
        asserts.assert(
          !pathExistsSync(oldDir),
          'Old directory should not exist',
        );
        asserts.assert(pathExistsSync(newDir), 'New directory should exist');

        removeDirSync(parentDir, { recursive: true });
      });
    });
  },
});

describe({
  name: 'compat.file - File Metadata Operations',
  fn: () => {
    describe('stat / statSync', () => {
      it('should get file metadata', async () => {
        const testFile = path.join(
          fixturesDir,
          'stat-file-' + Date.now() + '.txt',
        );
        await writeTextFile(testFile, 'test content');

        const info = await stat(testFile);

        asserts.assert(info.isFile, 'Should be a file');
        asserts.assert(!info.isDirectory, 'Should not be a directory');
        asserts.assert(info.size > 0, 'Should have size');
        asserts.assert(info.mtime instanceof Date, 'Should have mtime');

        await deleteFile(testFile);
      });

      it('should get directory metadata', async () => {
        const testDir = path.join(fixturesDir, 'stat-dir-' + Date.now());
        await makeDir(testDir);

        const info = await stat(testDir);

        asserts.assert(!info.isFile, 'Should not be a file');
        asserts.assert(info.isDirectory, 'Should be a directory');
        asserts.assert(info.mtime instanceof Date, 'Should have mtime');

        await removeDir(testDir);
      });

      it('should get file metadata synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'stat-sync-file-' + Date.now() + '.txt',
        );
        writeTextFileSync(testFile, 'test content');

        const info = statSync(testFile);

        asserts.assert(info.isFile, 'Should be a file');
        asserts.assert(!info.isDirectory, 'Should not be a directory');
        asserts.assert(info.size > 0, 'Should have size');

        deleteFileSync(testFile);
      });

      it('should throw FileNotFound for non-existent path', async () => {
        const nonExistent = path.join(
          fixturesDir,
          'no-such-file-' + Date.now(),
        );

        await asserts.assertRejects(
          async () => await stat(nonExistent),
          FileNotFound,
        );
      });
    });
  },
});

describe({
  name: 'compat.file - File Read/Write Operations',
  fn: () => {
    describe('readFile / readFileSync', () => {
      it('should read file as Uint8Array', async () => {
        const testFile = path.join(
          fixturesDir,
          'read-binary-' + Date.now() + '.bin',
        );
        const testData = new Uint8Array([1, 2, 3, 4, 5]);
        await writeFile(testFile, testData);

        const data = await readFile(testFile);

        asserts.assertEquals(data.length, 5, 'Should read 5 bytes');
        asserts.assertEquals(data[0], 1, 'First byte should be 1');
        asserts.assertEquals(data[4], 5, 'Last byte should be 5');

        await deleteFile(testFile);
      });

      it('should read file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'read-binary-sync-' + Date.now() + '.bin',
        );
        const testData = new Uint8Array([10, 20, 30]);
        writeFileSync(testFile, testData);

        const data = readFileSync(testFile);

        asserts.assertEquals(data.length, 3, 'Should read 3 bytes');
        asserts.assertEquals(data[0], 10, 'First byte should be 10');

        deleteFileSync(testFile);
      });

      it('should throw FileNotFound for non-existent file', async () => {
        const nonExistent = path.join(
          fixturesDir,
          'no-such-file-' + Date.now(),
        );

        await asserts.assertRejects(
          async () => await readFile(nonExistent),
          FileNotFound,
        );
      });
    });

    describe('readFileStream', () => {
      const withFile = async (fn: (file: string) => Promise<void>) => {
        const file = path.join(fixturesDir, 'stream-' + Date.now() + '.txt');
        await writeTextFile(file, '0123456789');
        try {
          await fn(file);
        } finally {
          await deleteFile(file);
        }
      };
      const drain = (s: ReadableStream<Uint8Array>) => new Response(s).text();

      it('streams the whole file', async () => {
        await withFile(async (file) => {
          asserts.assertEquals(
            await drain(await readFileStream(file)),
            '0123456789',
          );
        });
      });

      it('streams an inclusive byte range', async () => {
        await withFile(async (file) => {
          asserts.assertEquals(
            await drain(await readFileStream(file, { start: 2, end: 5 })),
            '2345',
          );
        });
      });

      it('streams from start to EOF', async () => {
        await withFile(async (file) => {
          asserts.assertEquals(
            await drain(await readFileStream(file, { start: 7 })),
            '789',
          );
        });
      });

      it('rejects with FileNotFound for a missing path', async () => {
        await asserts.assertRejects(
          () =>
            readFileStream(path.join(fixturesDir, 'no-stream-' + Date.now())),
          FileNotFound,
        );
      });

      it('rejects an invalid range before opening', async () => {
        await asserts.assertRejects(
          () =>
            readFileStream(
              path.join(fixturesDir, 'no-stream-' + Date.now()),
              { start: 5, end: 2 },
            ),
          FileOperationError,
          'invalid byte range',
        );
      });
    });

    describe('writeFile / writeFileSync', () => {
      it('should write binary data to file', async () => {
        const testFile = path.join(
          fixturesDir,
          'write-binary-' + Date.now() + '.bin',
        );
        const testData = new Uint8Array([100, 200, 255]);

        await writeFile(testFile, testData);

        asserts.assert(await pathExists(testFile), 'File should exist');
        const data = await readFile(testFile);
        asserts.assertEquals(data.length, 3, 'Should have 3 bytes');

        await deleteFile(testFile);
      });

      it('should write binary data synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'write-binary-sync-' + Date.now() + '.bin',
        );
        const testData = new Uint8Array([50, 100, 150]);

        writeFileSync(testFile, testData);

        asserts.assert(pathExistsSync(testFile), 'File should exist');
        const data = readFileSync(testFile);
        asserts.assertEquals(data.length, 3, 'Should have 3 bytes');

        deleteFileSync(testFile);
      });

      it('should append to existing file', async () => {
        const testFile = path.join(
          fixturesDir,
          'append-' + Date.now() + '.bin',
        );
        await writeFile(testFile, new Uint8Array([1, 2]));
        await writeFile(testFile, new Uint8Array([3, 4]), { append: true });

        const data = await readFile(testFile);
        asserts.assertEquals(data.length, 4, 'Should have 4 bytes');
        asserts.assertEquals(data[2], 3, 'Third byte should be 3');

        await deleteFile(testFile);
      });

      // Regression: { create: false } must truncate the existing file to
      // the written content, matching Deno. The old Node/Bun string-flag
      // mapping used 'r+' (no O_TRUNC), so overwriting a longer file with
      // shorter content left stale trailing bytes.
      it('should truncate an existing longer file when create is false', async () => {
        const testFile = path.join(
          fixturesDir,
          'write-create-false-trunc-' + Date.now() + '.txt',
        );
        await writeTextFile(testFile, 'AAAAAAAAAAAAAAAAAAAA'); // 20 bytes
        await writeTextFile(testFile, 'short', { create: false });

        asserts.assertEquals(
          await readTextFile(testFile),
          'short',
          'create:false must truncate; stale trailing bytes indicate the bug',
        );

        await deleteFile(testFile);
      });

      it('should truncate synchronously when create is false', () => {
        const testFile = path.join(
          fixturesDir,
          'write-create-false-trunc-sync-' + Date.now() + '.txt',
        );
        writeTextFileSync(testFile, 'AAAAAAAAAAAAAAAAAAAA');
        writeTextFileSync(testFile, 'short', { create: false });

        asserts.assertEquals(readTextFileSync(testFile), 'short');

        deleteFileSync(testFile);
      });

      it('should throw FileNotFound for { create: false } on a missing file', async () => {
        const missing = path.join(
          fixturesDir,
          'write-create-false-missing-' + Date.now() + '.txt',
        );
        await asserts.assertRejects(
          async () => await writeTextFile(missing, 'x', { create: false }),
          FileNotFound,
        );
        asserts.assertEquals(
          await pathExists(missing),
          false,
          'create:false must not create the file',
        );
      });

      // Regression: { append: true, create: false } must throw (like
      // Deno) rather than creating the file. The old 'a' string flag
      // always implied O_CREAT and silently created it.
      it('should throw FileNotFound for { append: true, create: false } on a missing file', async () => {
        const missing = path.join(
          fixturesDir,
          'write-append-create-false-missing-' + Date.now() + '.txt',
        );
        await asserts.assertRejects(
          async () =>
            await writeTextFile(missing, 'x', {
              append: true,
              create: false,
            }),
          FileNotFound,
        );
        asserts.assertEquals(
          await pathExists(missing),
          false,
          'append+create:false must not create the file',
        );
      });
    });

    describe('readJSONFile / readJSONFileSync', () => {
      it('should read JSON file', async () => {
        const testFile = path.join(
          fixturesDir,
          'test-json-' + Date.now() + '.json',
        );
        const testData = { name: 'test', value: 42, nested: { key: 'value' } };
        await writeTextFile(testFile, JSON.stringify(testData));

        const data = await readJSONFile<typeof testData>(testFile);

        asserts.assertEquals(data.name, 'test', 'Should have name property');
        asserts.assertEquals(data.value, 42, 'Should have value property');
        asserts.assertEquals(
          data.nested.key,
          'value',
          'Should have nested property',
        );

        await deleteFile(testFile);
      });

      it('should read JSON file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'test-json-sync-' + Date.now() + '.json',
        );
        const testData = { id: 123, active: true };
        writeTextFileSync(testFile, JSON.stringify(testData));

        const data = readJSONFileSync(testFile);

        asserts.assertEquals(data.id, 123, 'Should have id property');
        asserts.assertEquals(data.active, true, 'Should have active property');

        deleteFileSync(testFile);
      });

      it('should throw error for invalid JSON', async () => {
        const testFile = path.join(
          fixturesDir,
          'invalid-json-' + Date.now() + '.json',
        );
        await writeTextFile(testFile, '{ invalid json }');

        await asserts.assertRejects(
          async () => await readJSONFile(testFile),
          FileOperationError,
        );

        await deleteFile(testFile);
      });
    });

    describe('readTextFileSync', () => {
      it('should read text file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'text-sync-' + Date.now() + '.txt',
        );
        writeTextFileSync(testFile, 'Hello, sync world!');

        const content = readTextFileSync(testFile);

        asserts.assertEquals(
          content,
          'Hello, sync world!',
          'Should read correct content',
        );

        deleteFileSync(testFile);
      });

      it('should handle UTF-8 content', () => {
        const testFile = path.join(
          fixturesDir,
          'utf8-sync-' + Date.now() + '.txt',
        );
        const content = 'Hello 世界 🌍';
        writeTextFileSync(testFile, content);

        const read = readTextFileSync(testFile);

        asserts.assertEquals(read, content, 'Should handle UTF-8 correctly');

        deleteFileSync(testFile);
      });
    });

    describe('writeJSONFile / writeJSONFileSync', () => {
      it('should write JSON file', async () => {
        const testFile = path.join(
          fixturesDir,
          'write-json-' + Date.now() + '.json',
        );
        const testData = {
          name: 'test',
          value: 123,
          active: true,
          items: [1, 2, 3],
        };

        await writeJSONFile(testFile, testData);

        asserts.assert(await pathExists(testFile), 'File should exist');
        const data = await readJSONFile<typeof testData>(testFile);
        asserts.assertEquals(data.name, 'test', 'Should have name');
        asserts.assertEquals(data.value, 123, 'Should have value');
        asserts.assertEquals(data.items.length, 3, 'Should have items array');

        await deleteFile(testFile);
      });

      it('should write JSON file with formatting', async () => {
        const testFile = path.join(
          fixturesDir,
          'write-json-formatted-' + Date.now() + '.json',
        );
        const testData = { a: 1, b: 2 };

        await writeJSONFile(testFile, testData, { space: 2 });

        const content = await readTextFile(testFile);
        asserts.assert(
          content.includes('\n'),
          'Should have newlines (formatted)',
        );
        asserts.assert(content.includes('  '), 'Should have indentation');

        await deleteFile(testFile);
      });

      it('should write JSON file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'write-json-sync-' + Date.now() + '.json',
        );
        const testData = { id: 999, status: 'ok' };

        writeJSONFileSync(testFile, testData);

        asserts.assert(pathExistsSync(testFile), 'File should exist');
        const data = readJSONFileSync(testFile);
        asserts.assertEquals(data.id, 999, 'Should have id');
        asserts.assertEquals(data.status, 'ok', 'Should have status');

        deleteFileSync(testFile);
      });

      it('should write JSON file synchronously with formatting', () => {
        const testFile = path.join(
          fixturesDir,
          'write-json-sync-formatted-' + Date.now() + '.json',
        );
        const testData = { x: 1, y: 2 };

        writeJSONFileSync(testFile, testData, { space: 2 });

        const content = readTextFileSync(testFile);
        asserts.assert(content.includes('\n'), 'Should have newlines');

        deleteFileSync(testFile);
      });
    });
  },
});

describe({
  name: 'compat.file - File Copy/Move/Rename Operations',
  fn: () => {
    describe('copyFile / copyFileSync', () => {
      it('should copy a file', async () => {
        const srcFile = path.join(
          fixturesDir,
          'copy-src-' + Date.now() + '.txt',
        );
        const destFile = path.join(
          fixturesDir,
          'copy-dest-' + Date.now() + '.txt',
        );
        await writeTextFile(srcFile, 'test content');

        await copyFile(srcFile, destFile);

        asserts.assert(await pathExists(srcFile), 'Source should still exist');
        asserts.assert(await pathExists(destFile), 'Destination should exist');
        const content = await readTextFile(destFile);
        asserts.assertEquals(content, 'test content', 'Content should match');

        await deleteFile(srcFile);
        await deleteFile(destFile);
      });

      it('should copy a file synchronously', () => {
        const srcFile = path.join(
          fixturesDir,
          'copy-sync-src-' + Date.now() + '.txt',
        );
        const destFile = path.join(
          fixturesDir,
          'copy-sync-dest-' + Date.now() + '.txt',
        );
        writeTextFileSync(srcFile, 'sync content');

        copyFileSync(srcFile, destFile);

        asserts.assert(pathExistsSync(srcFile), 'Source should still exist');
        asserts.assert(pathExistsSync(destFile), 'Destination should exist');

        deleteFileSync(srcFile);
        deleteFileSync(destFile);
      });

      it('should throw FileNotFound if source does not exist', async () => {
        const srcFile = path.join(
          fixturesDir,
          'no-such-file-' + Date.now() + '.txt',
        );
        const destFile = path.join(fixturesDir, 'dest-' + Date.now() + '.txt');

        await asserts.assertRejects(
          async () => await copyFile(srcFile, destFile),
          FileNotFound,
        );
      });
    });

    describe('moveFile / moveFileSync', () => {
      it('should move a file', async () => {
        const srcFile = path.join(
          fixturesDir,
          'move-file-src-' + Date.now() + '.txt',
        );
        const destFile = path.join(
          fixturesDir,
          'move-file-dest-' + Date.now() + '.txt',
        );
        await writeTextFile(srcFile, 'move content');

        await moveFile(srcFile, destFile);

        asserts.assert(!await pathExists(srcFile), 'Source should not exist');
        asserts.assert(await pathExists(destFile), 'Destination should exist');
        const content = await readTextFile(destFile);
        asserts.assertEquals(content, 'move content', 'Content should match');

        await deleteFile(destFile);
      });

      it('should move a file synchronously', () => {
        const srcFile = path.join(
          fixturesDir,
          'move-sync-src-' + Date.now() + '.txt',
        );
        const destFile = path.join(
          fixturesDir,
          'move-sync-dest-' + Date.now() + '.txt',
        );
        writeTextFileSync(srcFile, 'sync move');

        moveFileSync(srcFile, destFile);

        asserts.assert(!pathExistsSync(srcFile), 'Source should not exist');
        asserts.assert(pathExistsSync(destFile), 'Destination should exist');

        deleteFileSync(destFile);
      });

      it('should throw FileNotFound if source does not exist', async () => {
        const srcFile = path.join(
          fixturesDir,
          'no-such-file-' + Date.now() + '.txt',
        );
        const destFile = path.join(fixturesDir, 'dest-' + Date.now() + '.txt');

        await asserts.assertRejects(
          async () => await moveFile(srcFile, destFile),
          FileNotFound,
        );
      });
    });

    describe('renameFile / renameFileSync', () => {
      it('should rename a file', async () => {
        const parentDir = path.join(fixturesDir, 'rename-parent-' + Date.now());
        await makeDir(parentDir);

        const oldFile = path.join(parentDir, 'oldname.txt');
        await writeTextFile(oldFile, 'rename content');

        await renameFile(oldFile, 'newname.txt');

        const newFile = path.join(parentDir, 'newname.txt');
        asserts.assert(!await pathExists(oldFile), 'Old file should not exist');
        asserts.assert(await pathExists(newFile), 'New file should exist');
        const content = await readTextFile(newFile);
        asserts.assertEquals(content, 'rename content', 'Content should match');

        await removeDir(parentDir, { recursive: true });
      });

      it('should rename a file synchronously', () => {
        const parentDir = path.join(
          fixturesDir,
          'rename-sync-parent-' + Date.now(),
        );
        makeDirSync(parentDir);

        const oldFile = path.join(parentDir, 'old.txt');
        writeTextFileSync(oldFile, 'content');

        renameFileSync(oldFile, 'new.txt');

        const newFile = path.join(parentDir, 'new.txt');
        asserts.assert(!pathExistsSync(oldFile), 'Old file should not exist');
        asserts.assert(pathExistsSync(newFile), 'New file should exist');

        removeDirSync(parentDir, { recursive: true });
      });

      it('should throw FileNotFound if file does not exist', async () => {
        const oldFile = path.join(
          fixturesDir,
          'no-such-file-' + Date.now() + '.txt',
        );

        await asserts.assertRejects(
          async () => await renameFile(oldFile, 'newname.txt'),
          FileNotFound,
        );
      });
    });
  },
});

describe({
  name: 'compat.file - Ensure Operations',
  fn: () => {
    describe('ensureFile / ensureFileSync', () => {
      it('should create file if it does not exist', async () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-file-' + Date.now() + '.txt',
        );

        await ensureFile(testFile);

        asserts.assert(await pathExists(testFile), 'File should exist');
        asserts.assert(await isFile(testFile), 'Path should be a file');

        await deleteFile(testFile);
      });

      it('should create parent directories if they do not exist', async () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-nested-' + Date.now(),
          'deep',
          'file.txt',
        );

        await ensureFile(testFile);

        asserts.assert(await pathExists(testFile), 'File should exist');
        asserts.assert(await isFile(testFile), 'Path should be a file');

        await removeDir(path.dirname(path.dirname(testFile)), {
          recursive: true,
        });
      });

      it('should not error if file already exists', async () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-existing-' + Date.now() + '.txt',
        );
        await writeTextFile(testFile, 'existing content');

        await ensureFile(testFile);

        asserts.assert(await pathExists(testFile), 'File should still exist');
        const content = await readTextFile(testFile);
        asserts.assertEquals(
          content,
          'existing content',
          'Content should not change',
        );

        await deleteFile(testFile);
      });

      it('should throw FileTypeMismatch if path is a directory', async () => {
        const testDir = path.join(fixturesDir, 'ensure-dir-' + Date.now());
        await makeDir(testDir);

        await asserts.assertRejects(
          async () => await ensureFile(testDir),
          FileTypeMismatch,
        );

        await removeDir(testDir);
      });

      it('should create file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-sync-file-' + Date.now() + '.txt',
        );

        ensureFileSync(testFile);

        asserts.assert(pathExistsSync(testFile), 'File should exist');
        asserts.assert(isFileSync(testFile), 'Path should be a file');

        deleteFileSync(testFile);
      });

      it('should create parent directories synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-sync-nested-' + Date.now(),
          'deep',
          'file.txt',
        );

        ensureFileSync(testFile);

        asserts.assert(pathExistsSync(testFile), 'File should exist');

        removeDirSync(path.dirname(path.dirname(testFile)), {
          recursive: true,
        });
      });
    });

    describe('ensureDir / ensureDirSync', () => {
      it('should create directory if it does not exist', async () => {
        const testDir = path.join(fixturesDir, 'ensure-dir-new-' + Date.now());

        await ensureDir(testDir);

        asserts.assert(await pathExists(testDir), 'Directory should exist');
        asserts.assert(
          await isDirectory(testDir),
          'Path should be a directory',
        );

        await removeDir(testDir);
      });

      it('should create parent directories if they do not exist', async () => {
        const timestamp = Date.now();
        const testDir = path.join(
          fixturesDir,
          'ensure-parent-' + timestamp,
          'nested',
          'deep',
        );

        await ensureDir(testDir);

        asserts.assert(await pathExists(testDir), 'Directory should exist');
        asserts.assert(
          await isDirectory(testDir),
          'Path should be a directory',
        );

        await removeDir(path.join(fixturesDir, 'ensure-parent-' + timestamp), {
          recursive: true,
        });
      });

      it('should not error if directory already exists', async () => {
        const testDir = path.join(
          fixturesDir,
          'ensure-existing-dir-' + Date.now(),
        );
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'existing.txt'), 'content');

        await ensureDir(testDir);

        asserts.assert(
          await pathExists(testDir),
          'Directory should still exist',
        );
        asserts.assert(
          await pathExists(path.join(testDir, 'existing.txt')),
          'Existing content should be preserved',
        );

        await removeDir(testDir, { recursive: true });
      });

      it('should throw FileTypeMismatch if path is a file', async () => {
        const testFile = path.join(
          fixturesDir,
          'ensure-file-exists-' + Date.now() + '.txt',
        );
        await writeTextFile(testFile, 'content');

        await asserts.assertRejects(
          async () => await ensureDir(testFile),
          FileTypeMismatch,
        );

        await deleteFile(testFile);
      });

      it('should create directory synchronously', () => {
        const testDir = path.join(fixturesDir, 'ensure-sync-dir-' + Date.now());

        ensureDirSync(testDir);

        asserts.assert(pathExistsSync(testDir), 'Directory should exist');
        asserts.assert(isDirectorySync(testDir), 'Path should be a directory');

        removeDirSync(testDir);
      });

      it('should create parent directories synchronously', () => {
        const testDir = path.join(
          fixturesDir,
          'ensure-sync-parent-' + Date.now(),
          'nested',
          'deep',
        );

        ensureDirSync(testDir);

        asserts.assert(pathExistsSync(testDir), 'Directory should exist');

        removeDirSync(path.dirname(path.dirname(testDir)), { recursive: true });
      });
    });
  },
});

describe({
  name: 'compat.file - Helper Operations',
  fn: () => {
    describe('remove / removeSync', () => {
      it('should remove a file', async () => {
        const testFile = path.join(
          fixturesDir,
          'remove-file-' + Date.now() + '.txt',
        );
        await writeTextFile(testFile, 'content');

        await remove(testFile);
        asserts.assert(!await pathExists(testFile), 'File should be removed');
      });

      it('should remove a directory recursively', async () => {
        const testDir = path.join(
          fixturesDir,
          'remove-helper-dir-' + Date.now(),
        );
        await makeDir(testDir);
        await writeTextFile(path.join(testDir, 'file.txt'), 'content');
        await makeDir(path.join(testDir, 'subdir'));

        await remove(testDir);
        asserts.assert(
          !await pathExists(testDir),
          'Directory should be removed',
        );
      });

      it('should remove file synchronously', () => {
        const testFile = path.join(
          fixturesDir,
          'remove-sync-file-' + Date.now() + '.txt',
        );
        writeTextFileSync(testFile, 'content');

        removeSync(testFile);
        asserts.assert(!pathExistsSync(testFile), 'File should be removed');
      });

      it('should remove directory synchronously', () => {
        const testDir = path.join(
          fixturesDir,
          'remove-sync-helper-dir-' + Date.now(),
        );
        makeDirSync(testDir);
        writeTextFileSync(path.join(testDir, 'file.txt'), 'content');

        removeSync(testDir);
        asserts.assert(!pathExistsSync(testDir), 'Directory should be removed');
      });
    });

    describe('makeTempFile / makeTempFileSync', () => {
      it('should create a temporary file', async () => {
        const tempFile = await makeTempFile();

        asserts.assert(await pathExists(tempFile), 'Temp file should exist');
        asserts.assert(await isFile(tempFile), 'Temp path should be a file');

        await deleteFile(tempFile);
      });

      it('should create a temporary file with prefix and suffix', async () => {
        const tempFile = await makeTempFile({
          prefix: 'test-',
          suffix: '.txt',
        });

        asserts.assert(await pathExists(tempFile), 'Temp file should exist');
        const basename = path.basename(tempFile);
        asserts.assert(basename.startsWith('test-'), 'Should have prefix');
        asserts.assert(basename.endsWith('.txt'), 'Should have suffix');

        await deleteFile(tempFile);
      });

      it('should create a temporary file in specified directory', async () => {
        const tempDir = path.join(fixturesDir, 'custom-temp-' + Date.now());
        await makeDir(tempDir);

        const tempFile = await makeTempFile({ dir: tempDir });

        asserts.assert(await pathExists(tempFile), 'Temp file should exist');
        asserts.assert(
          tempFile.startsWith(tempDir),
          'Temp file should be in specified directory',
        );

        await removeDir(tempDir, { recursive: true });
      });

      it('should create a temporary file synchronously', () => {
        const tempFile = makeTempFileSync();

        asserts.assert(pathExistsSync(tempFile), 'Temp file should exist');
        asserts.assert(isFileSync(tempFile), 'Temp path should be a file');

        deleteFileSync(tempFile);
      });

      it('should create temp file synchronously with options', () => {
        const tempFile = makeTempFileSync({ prefix: 'sync-', suffix: '.log' });

        asserts.assert(pathExistsSync(tempFile), 'Temp file should exist');
        const basename = path.basename(tempFile);
        asserts.assert(basename.startsWith('sync-'), 'Should have prefix');
        asserts.assert(basename.endsWith('.log'), 'Should have suffix');

        deleteFileSync(tempFile);
      });
    });

    describe('makeTempDir / makeTempDirSync', () => {
      it('should create a temporary directory', async () => {
        const tempDir = await makeTempDir();

        asserts.assert(
          await pathExists(tempDir),
          'Temp directory should exist',
        );
        asserts.assert(
          await isDirectory(tempDir),
          'Temp path should be a directory',
        );

        await removeDir(tempDir);
      });

      it('should create a temporary directory with prefix', async () => {
        const tempDir = await makeTempDir({ prefix: 'myapp-' });

        asserts.assert(
          await pathExists(tempDir),
          'Temp directory should exist',
        );
        const basename = path.basename(tempDir);
        asserts.assert(basename.startsWith('myapp-'), 'Should have prefix');

        await removeDir(tempDir);
      });

      it('should create a temporary directory in specified location', async () => {
        const parentDir = path.join(
          fixturesDir,
          'custom-temp-parent-' + Date.now(),
        );
        await makeDir(parentDir);

        const tempDir = await makeTempDir({ dir: parentDir, prefix: 'child-' });

        asserts.assert(
          await pathExists(tempDir),
          'Temp directory should exist',
        );
        asserts.assert(
          tempDir.startsWith(parentDir),
          'Temp directory should be in specified location',
        );

        await removeDir(parentDir, { recursive: true });
      });

      it('should create a temporary directory synchronously', () => {
        const tempDir = makeTempDirSync();

        asserts.assert(pathExistsSync(tempDir), 'Temp directory should exist');
        asserts.assert(
          isDirectorySync(tempDir),
          'Temp path should be a directory',
        );

        removeDirSync(tempDir);
      });

      it('should create temp directory synchronously with prefix and suffix', () => {
        const tempDir = makeTempDirSync({ prefix: 'test-', suffix: '-data' });

        asserts.assert(pathExistsSync(tempDir), 'Temp directory should exist');
        const basename = path.basename(tempDir);
        asserts.assert(basename.startsWith('test-'), 'Should have prefix');
        asserts.assert(basename.endsWith('-data'), 'Should have suffix');

        removeDirSync(tempDir);
      });
    });
  },
});

describe({
  name: 'compat.file - URL Conversion',
  fn: () => {
    describe('fromFileUrl', () => {
      it('should convert file URL to path', () => {
        const url = 'file:///home/user/file.txt';
        const result = fromFileUrl(url);
        asserts.assert(
          result.includes('file.txt'),
          'Path should contain filename',
        );
      });

      it('should convert URL object to path', () => {
        const url = new URL('file:///home/user/document.pdf');
        const result = fromFileUrl(url);
        asserts.assert(
          result.includes('document.pdf'),
          'Path should contain filename',
        );
      });

      it('should decode URL-encoded characters', () => {
        const url = 'file:///path/to/file%20with%20spaces.txt';
        const result = fromFileUrl(url);
        asserts.assert(
          result.includes('file with spaces.txt'),
          'Path should have decoded spaces',
        );
      });

      it('should handle special characters in URL', () => {
        const url = 'file:///test/%C3%A9%C3%A7%C3%A0.txt'; // éçà
        const result = fromFileUrl(url);
        asserts.assert(
          result.includes('.txt'),
          'Path should contain extension',
        );
      });

      it('should throw for non-file protocol', () => {
        asserts.assertThrows(
          () => fromFileUrl('https://example.com/file.txt'),
          FileOperationError,
          'Invalid URL protocol',
        );
      });

      it('should throw for http protocol', () => {
        asserts.assertThrows(
          () => fromFileUrl('http://localhost/file.txt'),
          FileOperationError,
          'Invalid URL protocol',
        );
      });

      it('should throw for ftp protocol', () => {
        asserts.assertThrows(
          () => fromFileUrl('ftp://server/file.txt'),
          FileOperationError,
          'Invalid URL protocol',
        );
      });

      it('should handle malformed URL strings', () => {
        asserts.assertThrows(
          () => fromFileUrl('not a valid url'),
          Error,
        );
      });
    });

    describe('toFileUrl', () => {
      it('should convert absolute path to file URL', () => {
        const testPath = path.join(cwd(), 'test.txt');
        const result = toFileUrl(testPath);

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.href.includes('test.txt'),
          'URL should contain filename',
        );
      });

      it('should convert relative path to file URL', () => {
        const result = toFileUrl('./test.txt');

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.href.includes('test.txt'),
          'URL should contain filename',
        );
      });

      it('should handle paths with spaces', () => {
        const testPath = path.join(cwd(), 'file with spaces.txt');
        const result = toFileUrl(testPath);

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.href.includes('file'),
          'URL should contain file name',
        );
      });

      it('should handle paths with special characters', () => {
        const testPath = path.join(cwd(), 'file-éçà.txt');
        const result = toFileUrl(testPath);

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.pathname.includes('.txt'),
          'URL pathname should contain extension',
        );
      });

      it('should use forward slashes in URL', () => {
        const testPath = path.join(cwd(), 'dir', 'subdir', 'file.txt');
        const result = toFileUrl(testPath);

        // URL should use forward slashes, not backslashes
        asserts.assert(
          !result.pathname.includes('\\'),
          'URL should not contain backslashes',
        );
      });

      it('should round-trip with fromFileUrl', () => {
        const originalPath = path.resolve(cwd(), 'test.txt');
        const url = toFileUrl(originalPath);
        const convertedPath = fromFileUrl(url);

        asserts.assertEquals(
          path.normalize(convertedPath),
          path.normalize(originalPath),
          'Round-trip conversion should preserve path',
        );
      });

      it('should handle nested directory paths', () => {
        const testPath = path.join(
          cwd(),
          'a',
          'b',
          'c',
          'd',
          'file.txt',
        );
        const result = toFileUrl(testPath);

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.href.includes('file.txt'),
          'URL should contain filename',
        );
      });

      it('should handle current directory path', () => {
        const result = toFileUrl('.');

        asserts.assertEquals(result.protocol, 'file:');
        asserts.assert(
          result.href.length > 'file:///'.length,
          'URL should contain path',
        );
      });
    });

    describe('URL conversion integration', () => {
      it('should work with real file operations', async () => {
        const testFile = path.join(
          fixturesDir,
          'url-test-' + Date.now() + '.txt',
        );
        const content = 'URL conversion test';

        // Create a file
        await ensureDir(fixturesDir);
        await writeTextFile(testFile, content);

        try {
          // Convert to URL and back
          const url = toFileUrl(testFile);
          const pathFromUrl = fromFileUrl(url);

          // Read using converted path
          const readContent = await readTextFile(pathFromUrl);
          asserts.assertEquals(
            readContent,
            content,
            'Content should match after URL conversion',
          );
        } finally {
          await deleteFile(testFile);
        }
      });

      it('should preserve path after multiple conversions', () => {
        const originalPath = path.resolve(cwd(), 'test', 'file.txt');

        // Convert multiple times
        const url1 = toFileUrl(originalPath);
        const path1 = fromFileUrl(url1);
        const url2 = toFileUrl(path1);
        const path2 = fromFileUrl(url2);

        asserts.assertEquals(
          path.normalize(path2),
          path.normalize(originalPath),
          'Path should be preserved after multiple conversions',
        );
      });
    });
  },
});

describe({
  name: 'compat.file - File Handle Operations',
  fn: () => {
    describe('openFile / openFileSync', () => {
      it('should open file for writing and write data async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-write-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        try {
          asserts.assertEquals(file.path, testFile, 'Path should match');
          asserts.assertEquals(file.closed, false, 'File should be open');

          const encoder = new TextEncoder();
          const data = encoder.encode('Hello FileHandle\n');
          const bytesWritten = await file.write(data);

          asserts.assertEquals(
            bytesWritten,
            data.length,
            'Should write all bytes',
          );

          await file.sync();
        } finally {
          file.close();
          await deleteFile(testFile);
        }
      });

      // Regression: on Bun, openFile must not keep an fs.promises FileHandle
      // object alive after close(). If it does, Bun's GC finalizer closes the
      // descriptor and throws ERR_INVALID_STATE — which surfaces as a spurious
      // failure in whatever unrelated test GC happens to run under. Closing
      // several handles and forcing GC makes a leak fail here. Bun-only: Bun.gc
      // and the finalizer-throws-on-collection semantics are Bun-specific.
      it({
        name: 'open/close leaves no FileHandle to close during GC (Bun)',
        deno: false,
        node: false,
        fn: async () => {
          await ensureDir(fixturesDir);
          for (let i = 0; i < 15; i++) {
            const testFile = path.join(
              fixturesDir,
              `file-handle-gc-${i}-${Date.now()}.txt`,
            );
            const file = await openFile(testFile, {
              write: true,
              create: true,
            });
            await file.write(new TextEncoder().encode('x'));
            file.close();
            asserts.assertEquals(file.closed, true, 'handle should be closed');
            await deleteFile(testFile);
          }
          // A leaked FileHandle's finalizer would throw here under forced GC.
          const gc = (globalThis as { Bun?: { gc(sync: boolean): void } }).Bun
            ?.gc;
          for (let i = 0; i < 8; i++) {
            gc?.(true);
            await new Promise((r) => setTimeout(r, 40));
          }
        },
      });

      it('should open file for writing and write data sync', () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-write-sync-' + Date.now() + '.txt',
        );

        ensureDirSync(fixturesDir);

        const file = openFileSync(testFile, {
          write: true,
          create: true,
        });

        try {
          asserts.assertEquals(file.path, testFile, 'Path should match');
          asserts.assertEquals(file.closed, false, 'File should be open');

          const encoder = new TextEncoder();
          const data = encoder.encode('Hello FileHandle Sync\n');
          const bytesWritten = file.write(data);

          asserts.assertEquals(
            bytesWritten,
            data.length,
            'Should write all bytes',
          );

          file.sync();
        } finally {
          file.close();
          deleteFileSync(testFile);
        }
      });

      it('should append data to existing file async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-append-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);
        await writeTextFile(testFile, 'Initial content\n');

        const file = await openFile(testFile, {
          write: true,
          append: true,
        });

        try {
          const encoder = new TextEncoder();
          await file.write(encoder.encode('Appended content\n'));
          await file.sync();
        } finally {
          file.close();
        }

        const content = await readTextFile(testFile);
        asserts.assert(
          content.includes('Initial content'),
          'Should contain initial content',
        );
        asserts.assert(
          content.includes('Appended content'),
          'Should contain appended content',
        );

        await deleteFile(testFile);
      });

      it('should append data to existing file sync', () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-append-sync-' + Date.now() + '.txt',
        );

        ensureDirSync(fixturesDir);
        writeTextFileSync(testFile, 'Initial content\n');

        const file = openFileSync(testFile, {
          write: true,
          append: true,
        });

        try {
          const encoder = new TextEncoder();
          file.write(encoder.encode('Appended content\n'));
          file.sync();
        } finally {
          file.close();
        }

        const content = readTextFileSync(testFile);
        asserts.assert(
          content.includes('Initial content'),
          'Should contain initial content',
        );
        asserts.assert(
          content.includes('Appended content'),
          'Should contain appended content',
        );

        deleteFileSync(testFile);
      });

      it('should handle multiple writes async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-multi-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        try {
          const encoder = new TextEncoder();

          for (let i = 0; i < 10; i++) {
            const data = encoder.encode(`Line ${i}\n`);
            await file.write(data);
          }

          await file.sync();
        } finally {
          file.close();
        }

        const content = await readTextFile(testFile);
        const lines = content.split('\n').filter((l) => l.length > 0);
        asserts.assertEquals(lines.length, 10, 'Should have 10 lines');

        for (let i = 0; i < 10; i++) {
          asserts.assert(
            lines[i] === `Line ${i}`,
            `Line ${i} should match`,
          );
        }

        await deleteFile(testFile);
      });

      it('should handle large writes async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-large-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        try {
          const encoder = new TextEncoder();
          // Create a 100KB buffer
          const largeData = 'x'.repeat(100 * 1024);
          const bytesWritten = await file.write(encoder.encode(largeData));

          asserts.assertEquals(
            bytesWritten,
            largeData.length,
            'Should write all bytes',
          );

          await file.sync();
        } finally {
          file.close();
        }

        const info = await stat(testFile);
        asserts.assert(
          info.size >= 100 * 1024,
          'File should be at least 100KB',
        );

        await deleteFile(testFile);
      });

      it('should create new file with truncate option async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-truncate-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);
        await writeTextFile(testFile, 'Old content to be removed');

        const file = await openFile(testFile, {
          write: true,
          truncate: true,
        });

        try {
          const encoder = new TextEncoder();
          await file.write(encoder.encode('New content'));
          await file.sync();
        } finally {
          file.close();
        }

        const content = await readTextFile(testFile);
        asserts.assertEquals(
          content,
          'New content',
          'Should contain only new content',
        );

        await deleteFile(testFile);
      });

      it('should throw error when writing to closed handle async', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-closed-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        file.close();

        await asserts.assertRejects(
          async () => {
            await file.write(new TextEncoder().encode('test'));
          },
          FileOperationError,
          'closed file handle',
        );

        await deleteFile(testFile);
      });

      it('should throw error when writing to closed handle sync', () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-closed-sync-' + Date.now() + '.txt',
        );

        ensureDirSync(fixturesDir);

        const file = openFileSync(testFile, {
          write: true,
          create: true,
        });

        file.close();

        asserts.assertThrows(
          () => {
            file.write(new TextEncoder().encode('test'));
          },
          FileOperationError,
          'closed file handle',
        );

        deleteFileSync(testFile);
      });

      it('should be idempotent when closing multiple times', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-multi-close-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        file.close();
        asserts.assertEquals(file.closed, true, 'File should be closed');

        // Should not throw
        file.close();
        file.close();

        await deleteFile(testFile);
      });

      it('should handle write-read-write mode', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-rw-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          read: true,
          write: true,
          create: true,
        });

        try {
          const encoder = new TextEncoder();
          await file.write(encoder.encode('Test content'));
          await file.sync();
        } finally {
          file.close();
        }

        const content = await readTextFile(testFile);
        asserts.assertEquals(
          content,
          'Test content',
          'Content should match',
        );

        await deleteFile(testFile);
      });

      it('should throw FileNotFound when opening non-existent file without create', async () => {
        const testFile = path.join(
          fixturesDir,
          'non-existent-' + Date.now() + '.txt',
        );

        await asserts.assertRejects(
          async () => {
            await openFile(testFile, { write: true });
          },
          FileNotFound,
        );
      });

      it('should throw FileNotFound when opening non-existent file without create sync', () => {
        const testFile = path.join(
          fixturesDir,
          'non-existent-sync-' + Date.now() + '.txt',
        );

        asserts.assertThrows(
          () => {
            openFileSync(testFile, { write: true });
          },
          FileNotFound,
        );
      });

      it('should update closed property after close', async () => {
        const testFile = path.join(
          fixturesDir,
          'file-handle-closed-prop-' + Date.now() + '.txt',
        );

        await ensureDir(fixturesDir);

        const file = await openFile(testFile, {
          write: true,
          create: true,
        });

        asserts.assertEquals(file.closed, false, 'Should start open');

        file.close();

        asserts.assertEquals(file.closed, true, 'Should be closed after close');

        await deleteFile(testFile);
      });
    });
  },
});

describe({
  name: 'compat.file - Setup and Cleanup',
  fn: () => {
    it('should ensure fixtures directory exists', async () => {
      if (!await pathExists(fixturesDir)) {
        await makeDir(fixturesDir);
      }
      asserts.assert(
        await pathExists(fixturesDir),
        'fixtures directory should exist',
      );
    });
  },
});

describe({
  name: 'compat.file - review fixes (2026-07)',
  fn: () => {
    // #1 — renameFileSync used to swallow non-FileOperationError failures and
    // return undefined as if the rename had succeeded.
    it('renameFileSync throws (does not swallow) when the file is missing', () => {
      const missing = path.join(
        fixturesDir,
        'rfs-missing-' + Date.now() + '.txt',
      );
      asserts.assertThrows(
        () => renameFileSync(missing, 'whatever.txt'),
        FileNotFound,
      );
    });

    // #6 — {write,create} without truncate must NOT truncate. Deno already
    // didn't; Node/Bun did (via the 'w' flag). Now consistent everywhere.
    it('openFile {write,create} without truncate preserves existing content', async () => {
      const f = path.join(fixturesDir, 'no-trunc-' + Date.now() + '.txt');
      await ensureDir(fixturesDir);
      await writeTextFile(f, 'ORIGINAL-LONG-CONTENT');
      const file = await openFile(f, { write: true, create: true });
      try {
        await file.write(new TextEncoder().encode('NEW'));
        await file.sync();
      } finally {
        file.close();
      }
      // First 3 bytes overwritten, the rest preserved — not truncated to 'NEW'.
      asserts.assertEquals(await readTextFile(f), 'NEWGINAL-LONG-CONTENT');
      await deleteFile(f);
    });

    it('openFileSync {write,create} without truncate preserves existing content', () => {
      const f = path.join(fixturesDir, 'no-trunc-sync-' + Date.now() + '.txt');
      ensureDirSync(fixturesDir);
      writeTextFileSync(f, 'ORIGINAL-LONG-CONTENT');
      const file = openFileSync(f, { write: true, create: true });
      try {
        file.write(new TextEncoder().encode('NEW'));
        file.sync();
      } finally {
        file.close();
      }
      asserts.assertEquals(readTextFileSync(f), 'NEWGINAL-LONG-CONTENT');
      deleteFileSync(f);
    });

    it('openFile {write,create,truncate} still truncates', async () => {
      const f = path.join(fixturesDir, 'trunc-' + Date.now() + '.txt');
      await ensureDir(fixturesDir);
      await writeTextFile(f, 'ORIGINAL-LONG-CONTENT');
      const file = await openFile(f, {
        write: true,
        create: true,
        truncate: true,
      });
      try {
        await file.write(new TextEncoder().encode('NEW'));
        await file.sync();
      } finally {
        file.close();
      }
      asserts.assertEquals(await readTextFile(f), 'NEW');
      await deleteFile(f);
    });

    // #7 — validatePath used to reject legitimate `../sibling` paths (while
    // letting absolute traversal through). Legit relative access must work.
    it('accepts legitimate parent-relative paths (no bogus traversal block)', async () => {
      const base = path.join(fixturesDir, 'pv-' + Date.now());
      const sub = path.join(base, 'sub');
      await makeDir(sub, { recursive: true });
      await writeTextFile(path.join(base, 'target.txt'), 'sibling-data');
      const viaParent = path.join(sub, '..', 'target.txt');
      asserts.assertEquals(await readTextFile(viaParent), 'sibling-data');
      await removeDir(base, { recursive: true });
    });

    it('still rejects null-byte and empty paths', async () => {
      await asserts.assertRejects(
        () => readTextFile('bad\0path.txt'),
        FileInvalidPath,
      );
      await asserts.assertRejects(() => readTextFile('   '), FileInvalidPath);
    });

    // #11 — temp names are crypto-random + collision-free (were
    // Date.now()+Math.random(), predictable and collision-prone).
    it('makeTempFile generates unique, crypto-random names', async () => {
      const paths = await Promise.all(
        Array.from({ length: 40 }, () => makeTempFile({ prefix: 'uniq-' })),
      );
      try {
        const names = paths.map((p) => path.basename(p));
        asserts.assertEquals(
          new Set(names).size,
          names.length,
          'all temp names must be unique',
        );
        for (const n of names) {
          // Old format was `uniq-<13-digit-epoch>-<weak>`; assert it's gone.
          asserts.assertEquals(
            /^uniq-\d{13}-/.test(n),
            false,
            'should not use the old Date.now() prefix',
          );
        }
      } finally {
        await Promise.all(paths.map((p) => deleteFile(p)));
      }
    });
  },
});

// =============================================================================
// Cloudflare Workers (simulated workerd)
// =============================================================================

describe({
  name: 'compat.file - Cloudflare Workers',
  // Deno-gated: these spawn a child with `Deno.Command`.
  bun: false,
  node: false,
  fn: () => {
    // The workerd shape can't be built in-process — `runtime.ts` and the
    // `node:fs` load both resolve at import time and this file imported
    // them long ago. So each case runs in a child that forges the globals
    // workerd presents: no `Deno`, a `process` reporting a Node version,
    // and a `getBuiltinModule` handing back the real built-ins (workerd's
    // `nodejs_compat` resolves `node:fs`/`node:os`/`node:stream` too, as
    // verified live). Same idiom as net.test.ts's Workers block.
    const WORKERS_PRELUDE = `// deno-lint-ignore-file no-explicit-any
const g = globalThis as any;
const realDeno = g.Deno;
const realProcess = g.process;
delete g.Deno;
Object.defineProperty(g, 'process', {
  value: {
    versions: { node: '22.11.0' },
    // workerd's nodejs_compat resolves these, verified live on workerd.
    getBuiltinModule: (id: string) => realProcess.getBuiltinModule(id),
  },
  configurable: true,
});
Object.defineProperty(g, 'navigator', {
  value: { userAgent: 'Cloudflare-Workers' },
  configurable: true,
});

const { RUNTIME } = await import('../runtime.ts');
const file = await import('../file.ts');

// Detection is latched at import time: RUNTIME, isDeno/isWorkers and the
// node:fs handle are all resolved by the two imports above, and stay
// resolved. Hand the globals back now so Deno's own node-compat shims —
// which dereference \`Deno\` on every call — can service the I/O. The
// branch under test is still the Workers one (isDeno stayed false); on
// real workerd that backend is native and needs no such restoration.
g.Deno = realDeno;
Object.defineProperty(g, 'process', { value: realProcess, configurable: true });

const out: Record<string, unknown> = { runtime: RUNTIME };
const record = async (key: string, fn: () => unknown) => {
  try {
    out[key] = { ok: true, value: await fn() };
  } catch (err) {
    out[key] = {
      ok: false,
      name: (err as Error).name,
      message: (err as Error).message,
    };
  }
};
`;

    /** Runs `body` under the forged workerd environment; returns its `out`. */
    // deno-lint-ignore no-explicit-any
    const runAsWorkers = async (body: string): Promise<any> => {
      const script = path.join(
        fixturesDir,
        `workers-file-${crypto.randomUUID()}.ts`,
      );
      await Deno.writeTextFile(
        script,
        `${WORKERS_PRELUDE}\n${body}\nconsole.log(JSON.stringify(out));\n`,
      );
      let result;
      try {
        result = await new Deno.Command(Deno.execPath(), {
          args: [
            'run',
            '--allow-read',
            '--allow-write',
            '--allow-env',
            // Deno's node:fs shim reads the process uid; a simulation
            // artifact, not something workerd's native backend needs.
            '--allow-sys',
            script,
          ],
          stdout: 'piped',
          stderr: 'piped',
        }).output();
      } finally {
        await Deno.remove(script);
      }
      const stderr = new TextDecoder().decode(result.stderr);
      asserts.assertEquals(result.code, 0, `child process failed:\n${stderr}`);
      return JSON.parse(new TextDecoder().decode(result.stdout));
    };

    it('round-trips a file: write, read back three ways, stat, delete', async () => {
      // The staging workflow this exists for: write scratch bytes, read
      // them back, relay them on, clean up. A write-only Workers build
      // would be useless for it, so every read path is exercised.
      const target = path.join(
        fixturesDir,
        `workers-roundtrip-${crypto.randomUUID()}.bin`,
      );
      try {
        const result = await runAsWorkers(`
const target = ${JSON.stringify(target)};
const payload = 'STAGED-UPLOAD';
await record('write', () =>
  file.writeFile(target, new TextEncoder().encode(payload)));
await record('readFile', async () =>
  new TextDecoder().decode(await file.readFile(target)));
await record('readTextFile', () => file.readTextFile(target));
await record('readFileStream', async () => {
  const stream = await file.readFileStream(target);
  const bytes: number[] = [];
  for await (const chunk of stream) bytes.push(...Array.from(chunk));
  return new TextDecoder().decode(new Uint8Array(bytes));
});
await record('stat', async () => (await file.stat(target)).size);
await record('pathExists', () => file.pathExists(target));
await record('deleteFile', () => file.deleteFile(target));
await record('existsAfterDelete', () => file.pathExists(target));
`);
        asserts.assertEquals(result.runtime, 'WORKERS');
        for (const key of ['write', 'readFile', 'readTextFile']) {
          asserts.assertEquals(
            result[key].ok,
            true,
            `${key} must work on Workers: ${result[key].name}: ${
              result[key].message
            }`,
          );
        }
        asserts.assertEquals(result.readFile.value, 'STAGED-UPLOAD');
        asserts.assertEquals(
          result.readTextFile.value,
          'STAGED-UPLOAD',
          'readTextFile must return the staged content, not throw',
        );
        asserts.assertEquals(
          result.readFileStream.ok,
          true,
          `readFileStream must work on Workers: ${result.readFileStream.message}`,
        );
        asserts.assertEquals(result.readFileStream.value, 'STAGED-UPLOAD');
        asserts.assertEquals(result.stat.value, 13);
        asserts.assertEquals(result.pathExists.value, true);
        asserts.assertEquals(result.deleteFile.ok, true);
        asserts.assertEquals(
          result.existsAfterDelete.value,
          false,
          'a staging workflow cleans up after itself',
        );
      } finally {
        if (await pathExists(target)) await deleteFile(target);
      }
    });

    it('round-trips through the sync variants too', async () => {
      const target = path.join(
        fixturesDir,
        `workers-sync-${crypto.randomUUID()}.bin`,
      );
      try {
        const result = await runAsWorkers(`
const target = ${JSON.stringify(target)};
await record('writeFileSync', () =>
  file.writeFileSync(target, new TextEncoder().encode('SYNC')));
await record('readFileSync', () =>
  new TextDecoder().decode(file.readFileSync(target)));
await record('readTextFileSync', () => file.readTextFileSync(target));
await record('statSync', () => file.statSync(target).size);
await record('pathExistsSync', () => file.pathExistsSync(target));
await record('deleteFileSync', () => file.deleteFileSync(target));
await record('existsAfterDelete', () => file.pathExistsSync(target));
`);
        asserts.assertEquals(
          result.writeFileSync.ok,
          true,
          `writeFileSync: ${result.writeFileSync.message}`,
        );
        asserts.assertEquals(result.readFileSync.value, 'SYNC');
        asserts.assertEquals(result.readTextFileSync.value, 'SYNC');
        asserts.assertEquals(result.statSync.value, 4);
        asserts.assertEquals(result.pathExistsSync.value, true);
        asserts.assertEquals(result.existsAfterDelete.value, false);
      } finally {
        if (await pathExists(target)) await deleteFile(target);
      }
    });

    it('temp creators need allowEphemeral, then work', async () => {
      // Group 2: unlike the ops above, these choose the location, so the
      // ephemerality is invisible at the call site without the opt-in.
      const result = await runAsWorkers(`
await record('fileNoFlag', () => file.makeTempFile());
await record('fileSyncNoFlag', () => file.makeTempFileSync());
await record('dirNoFlag', () => file.makeTempDir());
await record('dirSyncNoFlag', () => file.makeTempDirSync());
await record('fileFlag', async () => {
  const p = await file.makeTempFile({ allowEphemeral: true, suffix: '.bin' });
  await file.writeFile(p, new TextEncoder().encode('EPHEMERAL'));
  const back = await file.readTextFile(p);
  await file.deleteFile(p);
  return { back, gone: !(await file.pathExists(p)), endsWith: p.endsWith('.bin') };
});
await record('fileSyncFlag', () =>
  file.makeTempFileSync({ allowEphemeral: true }));
await record('dirFlag', () => file.makeTempDir({ allowEphemeral: true }));
await record('dirSyncFlag', () => file.makeTempDirSync({ allowEphemeral: true }));
`);
      for (
        const key of [
          'fileNoFlag',
          'fileSyncNoFlag',
          'dirNoFlag',
          'dirSyncNoFlag',
        ]
      ) {
        asserts.assertEquals(
          result[key].ok,
          false,
          `${key} must stay refused without the opt-in`,
        );
        asserts.assertEquals(result[key].name, 'UnsupportedRuntimeError');
        asserts.assertStringIncludes(result[key].message, 'allowEphemeral');
      }
      asserts.assertEquals(
        result.fileFlag.ok,
        true,
        `allowEphemeral must unlock makeTempFile: ${result.fileFlag.message}`,
      );
      asserts.assertEquals(result.fileFlag.value.back, 'EPHEMERAL');
      asserts.assertEquals(result.fileFlag.value.gone, true);
      asserts.assertEquals(
        result.fileFlag.value.endsWith,
        true,
        'suffix must still be honoured',
      );
      for (const key of ['fileSyncFlag', 'dirFlag', 'dirSyncFlag']) {
        asserts.assertEquals(
          result[key].ok,
          true,
          `${key} must be unlocked by the opt-in: ${result[key].message}`,
        );
      }
    });

    it('leaves directory, copy/move and handle operations throwing', async () => {
      // Regression pin: the path-based subset is all that opened up.
      const result = await runAsWorkers(`
const dir = ${JSON.stringify('fixturesDirPlaceholder')};
await record('copyFile', () => file.copyFile(dir + '/a', dir + '/b'));
await record('moveFile', () => file.moveFile(dir + '/a', dir + '/b'));
await record('makeDir', () => file.makeDir(dir + '/sub'));
await record('readDir', async () => {
  const names = [];
  for await (const e of file.readDir(dir)) names.push(e.name);
  return names;
});
await record('ensureFile', () => file.ensureFile(dir + '/a'));
await record('realPath', () => file.realPath(dir));
await record('remove', () => file.remove(dir + '/a'));
await record('openFile', () => file.openFile(dir + '/a'));
await record('copyDir', () => file.copyDir(dir, dir + '/copy'));
`.replace('fixturesDirPlaceholder', fixturesDir));
      for (
        const key of [
          'copyFile',
          'moveFile',
          'makeDir',
          'readDir',
          'ensureFile',
          'realPath',
          'remove',
          'openFile',
          'copyDir',
        ]
      ) {
        asserts.assertEquals(
          result[key].ok,
          false,
          `${key} must still be unsupported on Workers`,
        );
        asserts.assertEquals(
          result[key].name,
          'UnsupportedRuntimeError',
          `${key} threw ${result[key].name}: ${result[key].message}`,
        );
      }
    });
  },
});
