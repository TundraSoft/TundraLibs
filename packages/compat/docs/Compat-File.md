# Compat-File

Cross-runtime file system operations with a unified API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [Path Checking](#path-checking)
  - [File Reading](#file-reading)
  - [File Writing](#file-writing)
  - [File Handles](#file-handles)
  - [Directory Operations](#directory-operations)
  - [File/Directory Removal](#filedirectory-removal)
  - [Move Operations](#move-operations)
  - [Temporary Files and Directories](#temporary-files-and-directories)
  - [URL Conversion](#url-conversion)
- [Examples](#examples)
- [Error Handling](#error-handling)

## Overview

The File module provides a unified interface for file system operations across Deno, Bun, and Node.js runtimes. All operations have both async and sync variants.

### Key Features

- **Cross-runtime compatibility** - Works seamlessly across Deno, Bun, and Node.js
- **Async & Sync variants** - All operations available in both modes
- **Directory filtering** - Filter directory listings by file type, extension, or regex patterns
- **Type-safe** - Full TypeScript support with detailed type definitions
- **Error handling** - Specific error types for different failure scenarios

### Features

| Feature                | Bun | Deno | Node.js | Workers |
| ---------------------- | --- | ---- | ------- | ------- |
| Read files             | ✅  | ✅   | ✅      | ✅†     |
| Write files            | ✅  | ✅   | ✅      | ✅†     |
| Low-level file handles | ✅  | ✅   | ✅      | ❌      |
| Path checks            | ✅  | ✅   | ✅      | ✅†     |
| File stats             | ✅  | ✅   | ✅      | ✅†     |
| JSON operations        | ✅  | ✅   | ✅      | ❌      |
| Directory ops          | ✅  | ✅   | ✅      | ❌      |
| Directory filtering    | ✅  | ✅   | ✅      | ❌      |
| Remove files/dirs      | ✅  | ✅   | ✅      | ✅†§    |
| Temp file/dir creation | ✅  | ✅   | ✅      | opt-in  |

†Under `/tmp` only — see
[Cloudflare Workers](#cloudflare-workers) below.\
§`deleteFile` / `deleteFileSync` only; `remove` and the directory
removers still throw.

### Cloudflare Workers

Under `nodejs_compat`, workerd resolves `node:fs` and the path-based
operations run on it — but **only under `/tmp`**. Every other location is
refused by the platform itself (`operation not permitted` for a relative
path, `no such file or directory` for `/var/...`), so the path you pass
is the boundary and compat adds no guard of its own.

Workerd's `/tmp` is in-memory and **does not survive the request that
created it** — a file written in one request is already gone in the next.
Stage, read back and relay within a single request; never treat it as
storage.

Available on Workers:

- `readFile`, `readFileSync`, `readTextFile`, `readTextFileSync`,
  `readFileStream`
- `writeFile`, `writeFileSync`, `writeTextFile`, `writeTextFileSync`
- `stat`, `statSync`, `pathExists`, `pathExistsSync`
- `deleteFile`, `deleteFileSync`

`makeTempFile`, `makeTempFileSync`, `makeTempDir` and `makeTempDirSync`
choose the location themselves, so the ephemerality would be invisible at
the call site. They keep throwing `UnsupportedRuntimeError` on Workers
unless you pass `allowEphemeral: true`:

```ts
import {
  deleteFile,
  makeTempFile,
  readFile,
  writeFile,
} from '@tundralibs/compat/file';

// Stage an upload, read it back, relay it, clean up — all in one request.
const scratch = await makeTempFile({ allowEphemeral: true, suffix: '.bin' });
await writeFile(scratch, new Uint8Array([1, 2, 3]));
const staged = await readFile(scratch);
await deleteFile(scratch);
```

Everything else — directory operations, `copyFile` / `moveFile` /
`renameFile`, `ensureFile`, `realPath`, `remove`, the JSON helpers and the
`openFile` handle API — still throws `UnsupportedRuntimeError`.

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

## API Reference

### Path Checking

#### `pathExists()`

Checks if a path exists.

```typescript ignore
async function pathExists(path: string): Promise<boolean>;
```

**Example:**

```typescript
import { pathExists } from '@tundralibs/compat/file';

const exists = await pathExists('./config.json');
console.log(exists); // true or false
```

#### `pathExistsSync()`

Synchronous version of `pathExists()`.

```typescript ignore
function pathExistsSync(path: string): boolean;
```

#### `isFile()` / `isFileSync()`

Checks if a path points to a file.

```typescript ignore
async function isFile(path: string): Promise<boolean>;
function isFileSync(path: string): boolean;
```

**Example:**

```typescript
import { isFile } from '@tundralibs/compat/file';

const isRegularFile = await isFile('./document.pdf');
```

#### `isDirectory()` / `isDirectorySync()`

Checks if a path points to a directory.

```typescript ignore
async function isDirectory(path: string): Promise<boolean>;
function isDirectorySync(path: string): boolean;
```

**Aliases:** `isDir()`, `isDirSync()`

### File Statistics

#### `stat()` / `statSync()`

Gets detailed file or directory information.

```typescript ignore
async function stat(path: string): Promise<FileInfo>;
function statSync(path: string): FileInfo;

interface FileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  mode: number | null;
  uid: number | null;
  gid: number | null;
}
```

**Example:**

```typescript
import { stat } from '@tundralibs/compat/file';

const info = await stat('./data.txt');
console.log(`Size: ${info.size} bytes`);
console.log(`Modified: ${info.mtime}`);
```

### Reading Files

#### `readFile()` / `readFileSync()`

Reads a file as binary data.

```typescript ignore
async function readFile(path: string): Promise<Uint8Array>;
function readFileSync(path: string): Uint8Array;
```

**Example:**

```typescript
import { readFile } from '@tundralibs/compat/file';

const data = await readFile('./image.png');
console.log(data.length); // File size in bytes
```

#### `readFileStream()`

Opens a file as a `ReadableStream<Uint8Array>` without buffering it. `start`
and `end` are inclusive byte offsets; either may be omitted.

```typescript ignore
async function readFileStream(
  path: string,
  options?: { start?: number; end?: number },
): Promise<ReadableStream<Uint8Array>>;
```

**Example:**

```typescript
import { readFileStream } from '@tundralibs/compat/file';

const body = await readFileStream('./video.mp4', { start: 0, end: 1023 });
const response = new Response(body, { status: 206 });
```

#### `readTextFile()` / `readTextFileSync()`

Reads a file as UTF-8 text.

```typescript ignore
async function readTextFile(path: string): Promise<string>;
function readTextFileSync(path: string): string;
```

**Example:**

```typescript
import { readTextFile } from '@tundralibs/compat/file';

const content = await readTextFile('./README.md');
console.log(content);
```

#### `readJSONFile()` / `readJSONFileSync()`

Reads and parses a JSON file.

```typescript ignore
async function readJSONFile<T extends Record<string, unknown>>(
  path: string,
): Promise<T>;
function readJSONFileSync<T extends Record<string, unknown>>(path: string): T;
```

**Example:**

```typescript
import { readJSONFile } from '@tundralibs/compat/file';

type Config = {
  port: number;
  host: string;
};

const config = await readJSONFile<Config>('./config.json');
console.log(config.port);
```

### Writing Files

#### `writeFile()` / `writeFileSync()`

Writes binary data to a file.

```typescript ignore
async function writeFile(
  path: string,
  data: Uint8Array,
  options?: WriteOptions,
): Promise<void>;

function writeFileSync(
  path: string,
  data: Uint8Array,
  options?: WriteOptions,
): void;

type WriteOptions = {
  /** Whether to append to the file instead of overwriting. Defaults to false. */
  append?: boolean;
  /** Whether to create the file if it doesn't exist. Defaults to true. */
  create?: boolean;
  /** File mode (permissions), e.g., 0o644 for rw-r--r--. */
  mode?: number;
};
```

**Behavior (identical across Deno, Bun, and Node):**

- Unless `append` is `true`, the target file is **truncated** to the written
  content — overwriting a longer file with shorter content leaves **no** stale
  trailing bytes.
- With `create: false` the file must already exist. A missing file throws
  `FileNotFound`; the file is **not** created, even when `append: true`.

**Example:**

```typescript
import { writeFile } from '@tundralibs/compat/file';

const data = new Uint8Array([1, 2, 3, 4, 5]);
await writeFile('./data.bin', data);
```

#### `writeTextFile()` / `writeTextFileSync()`

Writes text to a file.

```typescript ignore
async function writeTextFile(
  path: string,
  content: string,
  options?: WriteOptions,
): Promise<void>;

function writeTextFileSync(
  path: string,
  content: string,
  options?: WriteOptions,
): void;
```

**Example:**

```typescript
import { writeTextFile } from '@tundralibs/compat/file';

await writeTextFile('./output.txt', 'Hello, World!');
```

#### `writeJSONFile()` / `writeJSONFileSync()`

Writes an object as JSON to a file.

```typescript ignore
async function writeJSONFile(
  path: string,
  data: unknown,
  options?: WriteOptions & { space?: number | string },
): Promise<void>;

function writeJSONFileSync(
  path: string,
  data: unknown,
  options?: WriteOptions & { space?: number | string },
): void;
```

**Example:**

```typescript
import { writeJSONFile } from '@tundralibs/compat/file';

const config = { port: 3000, host: 'localhost' };
await writeJSONFile('./config.json', config, { space: 2 });
```

### File Handles

Low-level file handle operations for fine-grained control over file I/O. Useful for high-performance scenarios like logging where you need control over buffering and disk syncing.

**Key Features:**

- **Type Safety**: `AsyncFileHandle` and `SyncFileHandle` are separate types that only expose appropriate methods
- **No Method Mixing**: Async handles only have async methods, sync handles only have sync methods
- **Cross-Runtime**: Works identically across Deno, Bun, and Node.js with optimized implementations
- **Resource Management**: Proper file descriptor handling prevents resource leaks and GC issues

#### `openFile()`

Opens a file and returns an async file handle with **only async methods**.

```typescript ignore
async function openFile(
  path: string,
  options: OpenOptions,
): Promise<AsyncFileHandle>;

interface OpenOptions {
  read?: boolean;
  write?: boolean;
  append?: boolean;
  create?: boolean;
  truncate?: boolean;
  mode?: number; // Unix permissions
}

type AsyncFileHandle = {
  readonly path: string;
  readonly closed: boolean;
  write(data: Uint8Array): Promise<number>; // Always returns Promise
  sync(): Promise<void>; // Always returns Promise
  close(): void; // Sync cleanup
};
```

**Parameters:**

- `path` - File path to open
- `options` - Open options (read, write, append, create, truncate)

> **`create` vs `truncate`:** `create` opens an existing file or makes a new
> one; on its own it does **not** clear existing content — writes overwrite
> from offset 0 and any trailing bytes remain. Pass `truncate: true` to clear
> the file to zero length first. This behaviour is identical across Deno,
> Bun, and Node.js (`openFileSync` follows the same rules).

**Returns:** Promise resolving to an `AsyncFileHandle`

**Throws:**

- `FileNotFound` - If file doesn't exist and `create` is false
- `FileAccessDenied` - If permission is denied
- `FileInvalidPath` - If path is invalid

**Important:** Always close the file handle when done to avoid resource leaks. Use try/finally blocks.

> **Technical Note**: In Node.js, `openFile()` keeps the full `FileHandle` object instead of extracting the file descriptor. This prevents garbage collection issues where the FileHandle's finalizer would attempt to close an already-closed descriptor, which could cause `EBADF` errors.

**Runtime Implementation:**

- **Deno**: Uses `Deno.FsFile` with native async methods
- **Bun**: Uses numeric file descriptor with callback-based operations
- **Node.js**: Uses `FileHandle` object from `fs.promises.open()` for proper resource management

**Example - Basic logging:**

```typescript
import { openFile } from '@tundralibs/compat/file';

const file = await openFile('./app.log', {
  write: true,
  create: true,
  append: true,
});

try {
  const encoder = new TextEncoder();
  await file.write(encoder.encode('Log entry\n'));
  await file.sync(); // Ensure data is written to disk
} finally {
  file.close(); // Always close to release resources
}
```

**Example - High-performance buffered logging:**

```typescript
import { openFile } from '@tundralibs/compat/file';

const file = await openFile('./performance.log', {
  write: true,
  create: true,
  append: true,
});

const buffer: Uint8Array[] = [];
let bufferSize = 0;
const MAX_BUFFER = 4096;

async function log(message: string) {
  const data = new TextEncoder().encode(message + '\n');
  buffer.push(data);
  bufferSize += data.length;

  if (bufferSize >= MAX_BUFFER) {
    await flush();
  }
}

async function flush() {
  for (const data of buffer) {
    await file.write(data);
  }
  await file.sync(); // Critical for data durability
  buffer.length = 0;
  bufferSize = 0;
}

// Usage
await log('Event 1');
await log('Event 2');
await flush(); // Flush remaining
file.close();
```

**Example - Truncate existing file:**

```typescript
import { openFile } from '@tundralibs/compat/file';

const file = await openFile('./output.txt', {
  write: true,
  create: true,
  truncate: true, // Clear existing content
});

try {
  await file.write(new TextEncoder().encode('Fresh content'));
} finally {
  file.close();
}
```

#### `openFileSync()`

Synchronously opens a file and returns a sync file handle with **only sync methods**.

```typescript ignore
function openFileSync(
  path: string,
  options: OpenOptions,
): SyncFileHandle;

type SyncFileHandle = {
  readonly path: string;
  readonly closed: boolean;
  write(data: Uint8Array): number; // Returns number directly (blocking)
  sync(): void; // Returns void directly (blocking)
  close(): void; // Sync cleanup
};
```

**Parameters:**

- `path` - File path to open
- `options` - Open options (read, write, append, create, truncate)

**Returns:** A `SyncFileHandle`

**Throws:**

- `FileNotFound` - If file doesn't exist and `create` is false
- `FileAccessDenied` - If permission is denied
- `FileInvalidPath` - If path is invalid

**Runtime Implementation:**

- **Deno**: Uses `Deno.FsFile` with native sync methods
- **Bun**: Uses numeric file descriptor with sync operations
- **Node.js**: Uses numeric file descriptor from `fs.openSync()`

**Example:**

```typescript
import { openFileSync } from '@tundralibs/compat/file';

const file = openFileSync('./config.txt', {
  write: true,
  create: true,
});

try {
  const encoder = new TextEncoder();
  file.write(encoder.encode('config=value\n'));
  file.sync(); // Ensure data is persisted
} finally {
  file.close();
}
```

**Type Safety and Method Separation:**

The file handles use **strict type separation** to prevent accidentally mixing async and sync operations:

```typescript
import { openFile, openFileSync } from '@tundralibs/compat/file';

declare const data: Uint8Array;

// ✅ Async handle - Only async methods available
const asyncFile = await openFile('./log.txt', { write: true, create: true });
const asyncBytes = await asyncFile.write(data); // Returns Promise<number>
await asyncFile.sync(); // Returns Promise<void>
// asyncFile.writeSync() doesn't exist!       // ❌ Not available

// ✅ Sync handle - Only sync methods available
const syncFile = openFileSync('./log.txt', { write: true, create: true });
const syncBytes = syncFile.write(data); // Returns number directly (blocking)
syncFile.sync(); // Returns void directly (blocking)
// syncFile.write() never returns Promise    // ❌ Always blocking
```

**Why This Matters:**

```typescript ignore
// ❌ This would be dangerous if allowed:
const file = await openFile('./log.txt', { write: true });
file.writeSync(data); // Would block event loop in async context!

// ✅ Instead, the type system prevents this:
const file = await openFile('./log.txt', { write: true });
// file.writeSync is not defined - TypeScript error!
```

This design ensures you can't accidentally block the event loop by using sync operations on an async handle, or waste resources by trying to await sync operations.

### Directory Operations

#### `makeDir()` / `makeDirSync()`

Creates a directory.

```typescript ignore
async function makeDir(
  path: string,
  options?: { recursive?: boolean; mode?: number },
): Promise<void>;

function makeDirSync(
  path: string,
  options?: { recursive?: boolean; mode?: number },
): void;
```

**Example:**

```typescript
import { makeDir } from '@tundralibs/compat/file';

// Create nested directories
await makeDir('./data/logs/2024', { recursive: true });
```

#### `readDir()` / `readDirSync()`

Lists directory contents with optional filtering.

```typescript ignore
async function readDir(
  path: string,
  options?: ReadDirOptions,
): AsyncIterable<DirectoryEntry>;

function readDirSync(
  path: string,
  options?: ReadDirOptions,
): Iterable<DirectoryEntry>;

interface DirectoryEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

interface ReadDirOptions {
  /** Include files in the results (default: true) */
  includeFiles?: boolean;
  /** Include directories in the results (default: true) */
  includeDirs?: boolean;
  /** Array of RegExp patterns - only include entries matching at least one pattern */
  match?: Array<RegExp>;
  /** Array of RegExp patterns - exclude entries matching any pattern */
  skip?: Array<RegExp>;
  /** Array of file extensions to include (e.g., ['.ts', '.js']) - only applies to files */
  exts?: Array<string>;
}
```

**Example:**

```typescript
import { readDir, readDirSync } from '@tundralibs/compat/file';

// List all entries
for await (const entry of readDir('./src')) {
  console.log(`${entry.name} (${entry.isFile ? 'file' : 'dir'})`);
}

// Only TypeScript files
for await (const entry of readDir('./src', { exts: ['.ts'] })) {
  console.log(entry.name);
}

// Skip test files
for await (const entry of readDir('./src', { skip: [/\.test\./] })) {
  console.log(entry.name);
}

// Only directories
for await (const entry of readDir('./src', { includeFiles: false })) {
  console.log(entry.name);
}

// Combined filters: TypeScript files matching pattern, excluding tests
for await (
  const entry of readDir('./src', {
    exts: ['.ts'],
    match: [/^app/],
    skip: [/\.test\./],
  })
) {
  console.log(entry.name);
}

// Synchronous version
for (const entry of readDirSync('./config', { exts: ['.json', '.yaml'] })) {
  console.log(entry.name);
}
```

### Removal Operations

#### `remove()` / `removeSync()`

Removes a file or directory.

```typescript ignore
async function remove(path: string): Promise<void>;
function removeSync(path: string): void;
```

**Example:**

```typescript
import { remove } from '@tundralibs/compat/file';

// Remove file
await remove('./temp.txt');

// Remove directory and contents (directories are always removed recursively)
await remove('./temp-dir');
```

#### `emptyDir()` / `emptyDirSync()`

Removes all contents of a directory while keeping the directory.

```typescript ignore
async function emptyDir(path: string): Promise<void>;
function emptyDirSync(path: string): void;
```

**Example:**

```typescript
import { emptyDir } from '@tundralibs/compat/file';

await emptyDir('./cache');
```

### Copy Operations

#### `copyFile()` / `copyFileSync()`

Copies a file.

```typescript ignore
async function copyFile(
  src: string,
  dest: string,
): Promise<void>;

function copyFileSync(
  src: string,
  dest: string,
): void;
```

**Example:**

```typescript
import { copyFile } from '@tundralibs/compat/file';

await copyFile('./source.txt', './backup/source.txt');
```

## Examples

### Configuration Management

```typescript
import {
  pathExists,
  readJSONFile,
  writeJSONFile,
} from '@tundralibs/compat/file';

type AppConfig = {
  port: number;
  host: string;
  debug: boolean;
};

async function loadConfig(path: string): Promise<AppConfig> {
  const defaults: AppConfig = {
    port: 3000,
    host: 'localhost',
    debug: false,
  };

  if (await pathExists(path)) {
    return await readJSONFile<AppConfig>(path);
  }

  await writeJSONFile(path, defaults, { space: 2 });
  return defaults;
}
```

### Safe File Operations

```typescript
import {
  isDirectory,
  makeDir,
  pathExists,
  writeTextFile,
} from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';

async function safeWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = path.dirname(filePath);

  // Ensure directory exists
  if (!await pathExists(dir)) {
    await makeDir(dir, { recursive: true });
  } else if (!await isDirectory(dir)) {
    throw new Error(`${dir} exists but is not a directory`);
  }

  await writeTextFile(filePath, content);
}
```

### High-Performance Logging with File Handles

```typescript
import { type AsyncFileHandle, openFile } from '@tundralibs/compat/file';

/**
 * High-performance logger using low-level file handles
 * with batched writes and explicit flushing.
 */
class PerformanceLogger {
  private file: AsyncFileHandle | null = null;
  private buffer: Uint8Array[] = [];
  private bufferSize = 0;
  private readonly encoder = new TextEncoder();
  private readonly maxBufferSize = 4096;

  async open(path: string): Promise<void> {
    this.file = await openFile(path, {
      write: true,
      create: true,
      append: true,
    });
  }

  async log(message: string): Promise<void> {
    if (!this.file) {
      throw new Error('Logger not initialized');
    }

    const data = this.encoder.encode(
      `[${new Date().toISOString()}] ${message}\n`,
    );
    this.buffer.push(data);
    this.bufferSize += data.length;

    // Auto-flush when buffer is full
    if (this.bufferSize >= this.maxBufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.file || this.buffer.length === 0) {
      return;
    }

    // Write all buffered data
    for (const data of this.buffer) {
      await this.file.write(data);
    }

    // Sync to disk for durability
    await this.file.sync();

    // Clear buffer
    this.buffer.length = 0;
    this.bufferSize = 0;
  }

  async close(): Promise<void> {
    if (this.file) {
      await this.flush(); // Flush remaining data
      this.file.close();
      this.file = null;
    }
  }
}

// Usage
const logger = new PerformanceLogger();
await logger.open('./app.log');

try {
  await logger.log('Application started');
  await logger.log('Processing request');
  await logger.log('Request completed');
} finally {
  await logger.close(); // Always close to flush and release resources
}
```

### Directory Processing

```typescript
import { isFile, readDir, readTextFile } from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';

// Basic directory processing
async function processMarkdownFiles(dirPath: string): Promise<void> {
  for await (const entry of readDir(dirPath)) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isFile && path.extname(entry.name) === '.md') {
      const content = await readTextFile(fullPath);
      console.log(`Processing ${entry.name} (${content.length} chars)`);
    } else if (entry.isDirectory) {
      await processMarkdownFiles(fullPath); // Recursive
    }
  }
}

// Using filters for more efficient processing
async function processSourceFiles(dirPath: string): Promise<void> {
  // Only process .ts files, skip test files
  for await (
    const entry of readDir(dirPath, {
      exts: ['.ts'],
      skip: [/\.test\./, /\.spec\./],
    })
  ) {
    const content = await readTextFile(entry.path);
    console.log(`Processing ${entry.name}`);
  }
}

// Count files by type
async function countFilesByType(
  dirPath: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for await (
    const entry of readDir(dirPath, { includeFiles: true, includeDirs: false })
  ) {
    const ext = path.extname(entry.name) || 'no-extension';
    counts[ext] = (counts[ext] || 0) + 1;
  }

  return counts;
}

// Find configuration files
async function findConfigFiles(dirPath: string): Promise<string[]> {
  const configFiles: string[] = [];

  for await (
    const entry of readDir(dirPath, {
      exts: ['.json', '.yaml', '.yml', '.toml'],
      match: [/config/, /settings/],
    })
  ) {
    configFiles.push(entry.path);
  }

  return configFiles;
}
```

### URL Conversion

#### `fromFileUrl()`

Converts a `file://` URL to a platform-specific file path.

```typescript ignore
function fromFileUrl(url: string | URL): string;
```

**Parameters:**

- `url` - The file URL to convert (string or URL object)

**Returns:** The file path as a string

**Throws:** `FileOperationError` if the URL doesn't use the `file:` protocol

**Example:**

```typescript
import { fromFileUrl } from '@tundralibs/compat/file';

// Basic conversion
const unixPath = fromFileUrl('file:///home/user/file.txt');
console.log(unixPath); // '/home/user/file.txt' on Unix

// With URL object
const url = new URL('file:///C:/Users/user/file.txt');
const windowsPath = fromFileUrl(url);
console.log(windowsPath); // 'C:\\Users\\user\\file.txt' on Windows

// With encoded characters
const decodedPath = fromFileUrl('file:///path/to/file%20with%20spaces.txt');
console.log(decodedPath); // '/path/to/file with spaces.txt'
```

#### `toFileUrl()`

Converts a file path to a `file://` URL.

```typescript ignore
function toFileUrl(filePath: string): URL;
```

**Parameters:**

- `filePath` - The file path to convert (relative or absolute)

**Returns:** A URL object with the `file:` protocol

**Throws:** `FileOperationError` if the path is invalid

**Example:**

```typescript
import { fromFileUrl, toFileUrl } from '@tundralibs/compat/file';

// Basic conversion
const unixUrl = toFileUrl('/home/user/file.txt');
console.log(unixUrl.href); // 'file:///home/user/file.txt'

// Windows path
const windowsUrl = toFileUrl('C:\\Users\\user\\file.txt');
console.log(windowsUrl.href); // 'file:///C:/Users/user/file.txt'

// Relative path (converts to absolute)
const relativeUrl = toFileUrl('./file.txt');
console.log(relativeUrl.href); // 'file:///current/working/dir/file.txt'

// Round-trip conversion
const originalPath = '/home/user/file.txt';
const roundTripUrl = toFileUrl(originalPath);
const convertedPath = fromFileUrl(roundTripUrl);
console.log(originalPath === convertedPath); // true
```

**Use Cases:**

- **Web Workers**: Pass file paths to web workers that expect URLs
- **Module Loading**: Convert file paths to URLs for dynamic imports
- **Cross-Platform**: Normalize path representation across different operating systems
- **APIs**: Work with APIs that require file URLs instead of paths

## Error Handling

All file operations throw specific error types:

### Error Types

- **`FileNotFound`** - File or directory doesn't exist
- **`FileAccessDenied`** - Permission denied
- **`FileInvalidPath`** - Invalid path format
- **`FileAlreadyExists`** - File already exists
- **`FileTypeMismatch`** - Path exists but is a different type than expected (e.g. directory where a file was expected)

**Example:**

```typescript
import {
  FileAccessDenied,
  FileNotFound,
  readTextFile,
} from '@tundralibs/compat/file';

try {
  const content = await readTextFile('./config.json');
} catch (error) {
  if (error instanceof FileNotFound) {
    console.error('Config file not found');
  } else if (error instanceof FileAccessDenied) {
    console.error('Permission denied');
  } else {
    throw error;
  }
}
```

## Best Practices

1. **Use async operations** - Prefer async over sync for better performance
2. **Check paths first** - Use `pathExists()` before operations when appropriate
3. **Handle errors** - Catch and handle specific error types
4. **Use recursive options** - Use `{ recursive: true }` for nested paths
5. **Validate paths** - Sanitize user-provided paths before use
6. **Always close file handles** - Use try/finally blocks to ensure handles are closed
7. **Batch writes with file handles** - For high-performance scenarios, use file handles with buffering
8. **Call sync() for critical data** - Use `file.sync()` after writing important data to ensure disk persistence

### File Handle Best Practices

```typescript
import { openFile } from '@tundralibs/compat/file';

declare const data: Uint8Array;

// ✅ Good - Always close in finally
const file = await openFile('./data.txt', { write: true, create: true });
try {
  await file.write(data);
  await file.sync(); // Ensure durability
} finally {
  file.close(); // Always execute
}

// ❌ Bad - File might not close if error occurs
const unguardedFile = await openFile('./data.txt', {
  write: true,
  create: true,
});
await unguardedFile.write(data);
unguardedFile.close(); // Might not execute
```

---

[← Back to Compat](../README.md)

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Usage

```typescript
import {
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  pathExists,
  pathExistsSync,
  readTextFile,
  readTextFileSync,
  remove,
  removeSync,
  writeTextFile,
  writeTextFileSync,
} from '@tundralibs/compat/file';
```

## API

### Read Operations

```typescript
import { readTextFile, readTextFileSync } from '@tundralibs/compat/file';

// Async
const content = await readTextFile('./config.json');

// Sync
const contentSync = readTextFileSync('./config.json');
```

### Write Operations

```typescript
import { writeTextFile, writeTextFileSync } from '@tundralibs/compat/file';

// Async
await writeTextFile('./output.txt', 'Hello World');

// Sync
writeTextFileSync('./output.txt', 'Hello World');
```

### Path Checking

```typescript
import {
  isDirectory,
  isDirectorySync,
  isFile,
  isFileSync,
  pathExists,
  pathExistsSync,
} from '@tundralibs/compat/file';

// Check if path exists
const exists = await pathExists('./data');
const existsSync = pathExistsSync('./data');

// Check if path is a file
const file = await isFile('./config.json');
const fileSync = isFileSync('./config.json');

// Check if path is a directory
const dir = await isDirectory('./data');
const dirSync = isDirectorySync('./data');
```

### Remove Operations

```typescript
import { remove, removeSync } from '@tundralibs/compat/file';

// Async
await remove('./temp.txt');

// Sync
removeSync('./temp.txt');
```

## Examples

### Configuration Loading

```typescript
import { pathExists, readTextFile } from '@tundralibs/compat/file';

async function loadConfig(path: string) {
  if (!(await pathExists(path))) {
    throw new Error(`Config not found: ${path}`);
  }

  const content = await readTextFile(path);
  return JSON.parse(content);
}
```

### Safe File Writing

```typescript
import {
  isDirectory,
  pathExists,
  writeTextFile,
} from '@tundralibs/compat/file';
import * as path from '@tundralibs/compat/path';

async function safeWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath);

  if (!(await pathExists(dir))) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  if (!(await isDirectory(dir))) {
    throw new Error(`Not a directory: ${dir}`);
  }

  await writeTextFile(filePath, content);
}
```

---

[← Back to Compat](../README.md)
