# Compat-Path

Cross-runtime path manipulation utilities with a unified API.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Constants](#constants)
- [API Reference](#api-reference)
- [Examples](#examples)

## Overview

The Path module provides platform-aware path manipulation utilities that work consistently across Windows, macOS, and Linux on all supported runtimes.

### Features

| Feature          | Bun | Deno | Node.js |
| ---------------- | --- | ---- | ------- |
| Path joining     | ✅  | ✅   | ✅      |
| Path resolution  | ✅  | ✅   | ✅      |
| Path parsing     | ✅  | ✅   | ✅      |
| Path formatting  | ✅  | ✅   | ✅      |
| Platform support | ✅  | ✅   | ✅      |

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

## Constants

### Path Separators

```typescript
const DELIMITER: string; // Path delimiter (: on Unix, ; on Windows)
const SEPARATOR: string; // Directory separator (/ on Unix, \ on Windows)
const SEPARATOR_PATTERN: RegExp; // Matches both / and \
```

**Example:**

```typescript
import { DELIMITER, SEPARATOR } from '@tundralibs/compat/path';

console.log(`Separator: ${SEPARATOR}`); // / on Unix, \ on Windows
console.log(`Delimiter: ${DELIMITER}`); // : on Unix, ; on Windows
```

## API Reference

### `join()`

Joins path segments into a single path.

```typescript
function join(...paths: string[]): string;
```

**Parameters:**

- `...paths` - Path segments to join

**Returns:** Joined path using platform-specific separators

**Example:**

```typescript
import { join } from '@tundralibs/compat/path';

const fullPath = join('src', 'components', 'Button.tsx');
// Unix: 'src/components/Button.tsx'
// Windows: 'src\components\Button.tsx'

const configPath = join(process.cwd(), 'config', 'app.json');
```

### `dirname()`

Returns the directory name of a path.

```typescript
function dirname(path: string): string;
```

**Parameters:**

- `path` - File or directory path

**Returns:** Directory containing the path

**Example:**

```typescript
import { dirname } from '@tundralibs/compat/path';

console.log(dirname('/home/user/file.txt')); // '/home/user'
console.log(dirname('C:\\Users\\file.txt')); // 'C:\Users'
console.log(dirname('relative/path/file.txt')); // 'relative/path'
```

### `basename()`

Returns the last portion of a path.

```typescript
function basename(path: string, ext?: string): string;
```

**Parameters:**

- `path` - Path to extract basename from
- `ext` - Optional extension to remove

**Returns:** Base name of the path

**Example:**

```typescript
import { basename } from '@tundralibs/compat/path';

console.log(basename('/home/user/file.txt')); // 'file.txt'
console.log(basename('/home/user/file.txt', '.txt')); // 'file'
console.log(basename('C:\\Users\\document.pdf')); // 'document.pdf'
```

### `extname()`

Returns the extension of a path.

```typescript
function extname(path: string): string;
```

**Parameters:**

- `path` - Path to extract extension from

**Returns:** File extension including the dot, or empty string if none

**Example:**

```typescript
import { extname } from '@tundralibs/compat/path';

console.log(extname('file.txt')); // '.txt'
console.log(extname('archive.tar.gz')); // '.gz'
console.log(extname('README')); // ''
console.log(extname('.gitignore')); // ''
```

### `resolve()`

Resolves path segments into an absolute path.

```typescript
function resolve(...paths: string[]): string;
```

**Parameters:**

- `...paths` - Path segments to resolve

**Returns:** Absolute path

**Example:**

```typescript
import { resolve } from '@tundralibs/compat/path';

// Relative to current directory
const absolute = resolve('src', 'components', 'App.tsx');

// From specific root
const configPath = resolve('/etc', 'app', 'config.json');
// Result: '/etc/app/config.json'

// With relative parts
const dataPath = resolve('/home/user', '../shared', 'data.json');
// Result: '/home/shared/data.json'
```

### `normalize()`

Normalizes a path, resolving `..` and `.` segments.

```typescript
function normalize(path: string): string;
```

**Parameters:**

- `path` - Path to normalize

**Returns:** Normalized path

**Example:**

```typescript
import { normalize } from '@tundralibs/compat/path';

console.log(normalize('/home/user/../admin/./file.txt'));
// Result: '/home/admin/file.txt'

console.log(normalize('src//components/./Button.tsx'));
// Result: 'src/components/Button.tsx'
```

### `isAbsolute()`

Determines if a path is absolute.

```typescript
function isAbsolute(path: string): boolean;
```

**Parameters:**

- `path` - Path to check

**Returns:** `true` if absolute, `false` otherwise

**Example:**

```typescript
import { isAbsolute } from '@tundralibs/compat/path';

console.log(isAbsolute('/home/user')); // true (Unix)
console.log(isAbsolute('C:\\Users')); // true (Windows)
console.log(isAbsolute('relative/path')); // false
console.log(isAbsolute('./src/index.ts')); // false
```

### `relative()`

Computes the relative path from one path to another.

```typescript
function relative(from: string, to: string): string;
```

**Parameters:**

- `from` - Starting path
- `to` - Destination path

**Returns:** Relative path from `from` to `to`

**Example:**

```typescript
import { relative } from '@tundralibs/compat/path';

const rel = relative('/home/user/app', '/home/user/docs/file.txt');
console.log(rel); // '../docs/file.txt'

const rel2 = relative('/data', '/data/logs/app.log');
console.log(rel2); // 'logs/app.log'
```

### `parse()`

Parses a path into its components.

```typescript
function parse(path: string): ParsedPath;

interface ParsedPath {
  root: string; // Root path (e.g., '/' or 'C:\')
  dir: string; // Directory path
  base: string; // File name with extension
  ext: string; // File extension
  name: string; // File name without extension
}
```

**Example:**

```typescript
import { parse } from '@tundralibs/compat/path';

const parsed = parse('/home/user/file.txt');
console.log(parsed);
// {
//   root: '/',
//   dir: '/home/user',
//   base: 'file.txt',
//   ext: '.txt',
//   name: 'file'
// }

const winPath = parse('C:\\Users\\file.txt');
// {
//   root: 'C:\\',
//   dir: 'C:\\Users',
//   base: 'file.txt',
//   ext: '.txt',
//   name: 'file'
// }
```

### `format()`

Formats a parsed path object into a path string.

```typescript
function format(pathObject: Partial<ParsedPath>): string;
```

**Parameters:**

- `pathObject` - Object with path components

**Returns:** Formatted path string

**Example:**

```typescript
import { format } from '@tundralibs/compat/path';

const path = format({
  dir: '/home/user',
  name: 'file',
  ext: '.txt',
});
console.log(path); // '/home/user/file.txt'

// Override base with name + ext
const path2 = format({
  root: 'C:\\',
  dir: 'C:\\Users',
  base: 'document.pdf',
});
console.log(path2); // 'C:\Users\document.pdf'
```

## Examples

### Building File Paths

```typescript
import { extname, join, resolve } from '@tundralibs/compat/path';

// Build paths relative to project root
const projectRoot = resolve('.');
const srcPath = join(projectRoot, 'src');
const configPath = join(projectRoot, 'config', 'app.json');

// Filter files by extension
function isTypeScriptFile(path: string): boolean {
  const ext = extname(path);
  return ext === '.ts' || ext === '.tsx';
}
```

### Path Transformations

```typescript
import { basename, dirname, extname, join } from '@tundralibs/compat/path';

function changeExtension(filePath: string, newExt: string): string {
  const dir = dirname(filePath);
  const name = basename(filePath, extname(filePath));
  return join(dir, name + newExt);
}

// Usage
const tsFile = 'src/components/Button.tsx';
const jsFile = changeExtension(tsFile, '.js');
// Result: 'src/components/Button.js'
```

### Relative Path Navigation

```typescript
import { dirname, join, relative } from '@tundralibs/compat/path';

function getRelativeImportPath(
  fromFile: string,
  toFile: string,
): string {
  const fromDir = dirname(fromFile);
  let relPath = relative(fromDir, toFile);

  // Remove extension for imports
  const ext = extname(relPath);
  if (ext) {
    relPath = relPath.slice(0, -ext.length);
  }

  // Ensure relative path starts with . or ..
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath;
  }

  return relPath;
}

// Usage
const importPath = getRelativeImportPath(
  'src/pages/Home.tsx',
  'src/components/Button.tsx',
);
// Result: '../components/Button'
```

### Platform-Aware Path Handling

```typescript
import {
  normalize,
  SEPARATOR,
  SEPARATOR_PATTERN,
} from '@tundralibs/compat/path';

function ensurePlatformPath(path: string): string {
  // Replace all separators with platform-specific one
  return path.replace(SEPARATOR_PATTERN, SEPARATOR);
}

function toUnixPath(path: string): string {
  // Convert any path to Unix-style
  return path.replace(/\\/g, '/');
}

function toWindowsPath(path: string): string {
  // Convert any path to Windows-style
  return path.replace(/\//g, '\\');
}
```

### Path Parsing and Validation

```typescript
import { extname, isAbsolute, parse } from '@tundralibs/compat/path';

interface FileInfo {
  path: string;
  name: string;
  extension: string;
  isAbsolute: boolean;
  directory: string;
}

function analyzeFilePath(path: string): FileInfo {
  const parsed = parse(path);

  return {
    path,
    name: parsed.name,
    extension: parsed.ext,
    isAbsolute: isAbsolute(path),
    directory: parsed.dir,
  };
}

// Usage
const info = analyzeFilePath('/home/user/documents/report.pdf');
console.log(info);
// {
//   path: '/home/user/documents/report.pdf',
//   name: 'report',
//   extension: '.pdf',
//   isAbsolute: true,
//   directory: '/home/user/documents'
// }
```

## Platform Considerations

### Windows vs Unix

The module automatically handles platform differences:

- **Separators**: Uses `/` on Unix, `\` on Windows
- **Roots**: Unix paths start with `/`, Windows with drive letter `C:\`
- **Case sensitivity**: Windows is case-insensitive, Unix is case-sensitive

### Cross-Platform Best Practices

1. **Always use path functions** - Never manually concatenate paths
2. **Use forward slashes in code** - Convert at runtime with `normalize()`
3. **Test on target platforms** - Path behavior can differ subtly
4. **Avoid assumptions** - Don't assume separator or root format

**Example:**

```typescript
import { join, normalize } from '@tundralibs/compat/path';

// ✅ Good - Cross-platform
const path1 = join('src', 'components', 'App.tsx');

// ✅ Good - Normalize mixed separators
const path2 = normalize('src/components\\Button.tsx');

// ❌ Bad - Manual concatenation
const path3 = 'src' + '/' + 'components' + '/' + 'App.tsx';

// ❌ Bad - Platform-specific
const path4 = 'C:\\Users\\file.txt'; // Won't work on Unix
```

---

[← Back to Compat](../README.md)
