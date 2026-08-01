# Compat-Permissions

Cross-runtime permission checking with graceful degradation.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Permission Types](#permission-types)
- [API Reference](#api-reference)
- [Examples](#examples)

## Overview

The Permissions module provides a unified interface for checking permissions across runtimes. It leverages Deno's permission system when available and gracefully assumes permissions are granted in Bun and Node.js.

### Features

| Feature                | Bun                 | Deno             | Node.js             |
| ---------------------- | ------------------- | ---------------- | ------------------- |
| Permission checks      | ✅ (always granted) | ✅ (real checks) | ✅ (always granted) |
| Async checks           | ✅                  | ✅               | ✅                  |
| Sync checks            | ✅                  | ✅               | ✅                  |
| Fine-grained scopes    | ➖ (N/A)            | ✅               | ➖ (N/A)            |
| Runtime-aware behavior | ✅                  | ✅               | ✅                  |

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

## Permission Types

### Available Permissions

| Permission | Scope Property         | Description                 | Deno Only |
| ---------- | ---------------------- | --------------------------- | --------- |
| `env`      | `variable?: string`    | Environment variable access | ✅        |
| `ffi`      | `path?: string \| URL` | Foreign Function Interface  | ✅        |
| `net`      | `host?: string`        | Network access              | ✅        |
| `read`     | `path?: string \| URL` | File/directory read access  | ✅        |
| `write`    | `path?: string \| URL` | File/directory write access | ✅        |
| `run`      | `path?: string \| URL` | Subprocess execution        | ✅        |
| `sys`      | -                      | System information access   | ✅        |
| `import`   | -                      | Dynamic import access       | ✅        |

### Permission Object

```typescript
type PermissionObject<T extends PermissionName = PermissionName> =
  & {
    name: T;
  }
  & (T extends 'env' ? { variable?: string }
    : T extends 'ffi' ? { path?: string | URL }
    : T extends 'net' ? { host?: string }
    : T extends 'read' | 'write' | 'run' ? { path?: string | URL }
    : never);
```

## API Reference

### `getPermissions()`

Gets the permission status for a given permission.

```typescript
async function getPermissions(
  options: PermissionObject,
): Promise<PermissionResponse>;

type PermissionResponse = 'GRANTED' | 'DENIED';
```

**Parameters:**

- `options.name` - The permission to check
- `options.*` - Permission-specific scope (path, host, variable, etc.)

**Returns:** Promise resolving to `'GRANTED'` or `'DENIED'`

**Throws:** `TypeError` if permission name is invalid

**Runtime Behavior:**

- **Deno**: Queries `Deno.permissions.query()`
- **Bun/Node.js**: Always returns `'GRANTED'`

**Example:**

```typescript
import { getPermissions } from '@tundralibs/compat/permissions';

const readStatus = await getPermissions({ name: 'read', path: './data' });
console.log(readStatus); // 'GRANTED' or 'DENIED'

const netStatus = await getPermissions({
  name: 'net',
  host: 'api.example.com',
});
const envStatus = await getPermissions({ name: 'env', variable: 'HOME' });
```

### `getPermissionsSync()`

Synchronous version of `getPermissions()`.

```typescript
function getPermissionsSync(
  options: PermissionObject,
): PermissionResponse;
```

**Example:**

```typescript
import { getPermissionsSync } from '@tundralibs/compat/permissions';

const writeStatus = getPermissionsSync({ name: 'write', path: './logs' });
if (writeStatus === 'GRANTED') {
  // Write to logs
}
```

### `hasPermission()`

Checks if a permission is granted (convenience wrapper).

```typescript
async function hasPermission(
  options: PermissionObject,
): Promise<boolean>;
```

**Parameters:**

- `options` - Permission object

**Returns:** `true` if granted, `false` if denied

**Example:**

```typescript
import { hasPermission } from '@tundralibs/compat/permissions';

if (await hasPermission({ name: 'net', host: 'github.com' })) {
  // Make network request
  await fetch('https://github.com/api');
}
```

### `hasPermissionSync()`

Synchronous version of `hasPermission()`.

```typescript
function hasPermissionSync(
  options: PermissionObject,
): boolean;
```

**Example:**

```typescript
import { hasPermissionSync } from '@tundralibs/compat/permissions';

function readConfig() {
  if (!hasPermissionSync({ name: 'read', path: './config.json' })) {
    throw new Error('No read permission for config');
  }
  // Read config file
}
```

## Examples

### Pre-Flight Permission Checks

```typescript
import {
  hasPermissionSync,
  PermissionObject,
} from '@tundralibs/compat/permissions';

function ensurePermissions(permissions: PermissionObject[]): void {
  for (const perm of permissions) {
    if (!hasPermissionSync(perm)) {
      const desc = JSON.stringify(perm);
      throw new Error(`Missing permission: ${desc}`);
    }
  }
}

// Usage
ensurePermissions([
  { name: 'read', path: './data' },
  { name: 'write', path: './output' },
  { name: 'net', host: 'api.example.com' },
]);
```

### Conditional Feature Enablement

```typescript
import { hasPermission } from '@tundralibs/compat/permissions';

async function loadConfiguration() {
  // Try environment variables first
  if (await hasPermission({ name: 'env' })) {
    const apiKey = Deno.env.get('API_KEY');
    if (apiKey) return { apiKey };
  }

  // Fall back to file
  if (await hasPermission({ name: 'read', path: './secrets.json' })) {
    const file = await Deno.readTextFile('./secrets.json');
    return JSON.parse(file);
  }

  throw new Error('No configuration source available');
}
```

### Runtime-Aware Permission Handling

```typescript
import { isDeno } from '@tundralibs/compat/runtime';
import { hasPermissionSync } from '@tundralibs/compat/permissions';

function canAccessPath(path: string): boolean {
  // In Deno, check actual permissions
  if (isDeno) {
    return hasPermissionSync({ name: 'read', path });
  }

  // In other runtimes, check if file exists
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}
```

### Graceful Degradation

```typescript
import { hasPermission } from '@tundralibs/compat/permissions';
import { isDeno } from '@tundralibs/compat/runtime';

async function connectToDatabase(host: string) {
  if (isDeno) {
    // In Deno, verify network permission
    if (!await hasPermission({ name: 'net', host })) {
      console.warn(`No network permission for ${host}`);
      return null;
    }
  }

  // Proceed with connection
  return await createConnection(host);
}
```

### Testing with Permission Checks

```typescript
import { describe, it } from '@tundralibs/compat/test';
import { hasPermissionSync } from '@tundralibs/compat/permissions';
import { assert, assertThrows } from '@std/assert';

describe('File operations', () => {
  it({
    name: 'should read file',
    // Only run in Deno with read permission
    deno: hasPermissionSync({ name: 'read', path: './test-data' }),
    bun: false,
    node: false,
    fn() {
      const content = Deno.readTextFileSync('./test-data/sample.txt');
      assert(content.length > 0);
    },
  });

  it({
    name: 'should handle no permission',
    // Skip if we already have permission (testing the denial case)
    ignore: hasPermissionSync({ name: 'write', path: '/root' }),
    bun: false,
    node: false,
    fn() {
      assertThrows(() => {
        Deno.writeTextFileSync('/root/file.txt', 'data');
      });
    },
  });
});
```

### Permission-Based Feature Flags

```typescript
import { hasPermission } from '@tundralibs/compat/permissions';

interface Features {
  networking: boolean;
  fileSystem: boolean;
  environment: boolean;
  subprocess: boolean;
}

async function detectFeatures(): Promise<Features> {
  return {
    networking: await hasPermission({ name: 'net' }),
    fileSystem: await hasPermission({ name: 'read' }),
    environment: await hasPermission({ name: 'env' }),
    subprocess: await hasPermission({ name: 'run' }),
  };
}

// Usage
const features = await detectFeatures();
if (features.networking) {
  // Enable network-dependent features
}
```

## Runtime Behavior

### Deno

In Deno, permission checks use the actual permission system:

```bash
# Grant specific permissions
deno run --allow-read=./data --allow-write=./output script.ts

# Check permissions at runtime
deno run --prompt script.ts  # Prompt when permission needed
```

**Result:**

- Returns actual permission state
- Respects `--allow-*` flags
- Can be scoped to specific paths/hosts

### Bun and Node.js

In Bun and Node.js, permissions are always granted:

```bash
# No permission flags needed
bun run script.ts
node script.ts
```

**Result:**

- Always returns `'GRANTED'`
- No runtime permission system
- Relies on OS-level permissions

## Best Practices

1. **Check before using** - Always check permissions before sensitive operations in Deno
2. **Handle gracefully** - Provide fallbacks when permissions are denied
3. **Be specific** - Use scoped permissions (path, host) when possible
4. **Don't over-check** - Cache permission status if checking repeatedly
5. **Test both cases** - Test with and without permissions granted

**Example:**

```typescript
import { hasPermission } from '@tundralibs/compat/permissions';

// ✅ Good - Specific scope
const canRead = await hasPermission({
  name: 'read',
  path: './config.json',
});

// ✅ Good - Graceful fallback
if (!canRead) {
  console.warn('Using default config');
  return defaultConfig;
}

// ❌ Bad - Too broad (checking all read permission)
const canReadAnything = await hasPermission({ name: 'read' });

// ❌ Bad - No fallback
if (!canRead) {
  throw new Error('Need read permission!'); // Unhelpful
}
```

## Error Handling

```typescript
import {
  getPermissions,
  PermissionObject,
} from '@tundralibs/compat/permissions';

try {
  // Invalid permission name
  await getPermissions({ name: 'invalid' as any });
} catch (error) {
  if (error instanceof TypeError) {
    console.error('Invalid permission name');
  }
}
```

---

[← Back to Compat](../README.md)

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Usage

```typescript
import { hasPermission, hasPermissionSync } from './permissions.ts';
```

## API

### hasPermission(descriptor)

Async permission check.

```typescript
const canRead = await hasPermission({ name: 'read', path: './data' });
const canWrite = await hasPermission({ name: 'write', path: './output' });
const canNet = await hasPermission({ name: 'net', host: 'api.example.com' });
```

### hasPermissionSync(descriptor)

Sync permission check.

```typescript
const canRead = hasPermissionSync({ name: 'read', path: './data' });
```

## Permission Descriptors

| Permission | Properties          | Description                 |
| ---------- | ------------------- | --------------------------- |
| `read`     | `path?: string`     | File/directory read access  |
| `write`    | `path?: string`     | File/directory write access |
| `net`      | `host?: string`     | Network access              |
| `env`      | `variable?: string` | Environment variable access |
| `run`      | `command?: string`  | Subprocess execution        |

## Runtime Behavior

| Runtime     | Behavior                                        |
| ----------- | ----------------------------------------------- |
| **Deno**    | Uses `Deno.permissions.query()` for real checks |
| **Bun**     | Always returns `true` (no permission system)    |
| **Node.js** | Always returns `true` (no permission system)    |

## Examples

### Pre-flight Checks

```typescript
import { hasPermissionSync } from './permissions.ts';

function ensurePermissions() {
  if (!hasPermissionSync({ name: 'read', path: './config' })) {
    throw new Error('Cannot read config directory');
  }

  if (!hasPermissionSync({ name: 'write', path: './logs' })) {
    throw new Error('Cannot write to logs directory');
  }
}
```

### Conditional Features

```typescript
import { hasPermission } from './permissions.ts';

async function loadSecrets() {
  if (await hasPermission({ name: 'env', variable: 'API_KEY' })) {
    return process.env.API_KEY;
  }

  // Fallback to file-based secrets
  return loadFromFile('./secrets.json');
}
```

---

[← Back to Compat](../README.md)
