/**
 * @fileoverview Cross-runtime file system operations.
 *
 * Provides a unified interface for file and directory operations across
 * Deno, Bun, and Node.js runtimes with both async and sync variants.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { readFile, writeFile, pathExists } from '@tundrasoft/compat/file';
 *
 * const exists = await pathExists('./data.txt');
 * if (exists) {
 *   const content = await readFile('./data.txt');
 * }
 * ```
 */

import { Bun, loadBuiltin } from './_runtime-globals.ts';
import { isBun, isDeno, isNode, OS } from './runtime.ts';
import { CompatError } from './Error.ts';
import * as path from './path.ts';

/** Node.js modules, loaded synchronously for Bun/Node environments */
// Local alias for the Deno-only file handle — see _runtime-globals.ts.
// The runtime object has `.read()/.write()/.sync()/.close()` etc.; the
// `any` typing decouples us from Deno's lib type definition.
// deno-lint-ignore no-explicit-any
type DenoFsFile = any;

/** Node.js FileHandle type from fs.promises.open() */
type NodeFsHandle = Awaited<ReturnType<typeof import('node:fs').promises.open>>;

// Resolved through `process.getBuiltinModule` rather than a top-level
// `await import()` — the sync variants (`readTextFileSync`, `statSync`, …)
// need the backend before any promise can settle, and TLA here would make
// bundlers turn every consumer module into an async initializer (see
// {@link loadBuiltin}). Deno reaches the same operations through `Deno.*`,
// so it skips both loads.
const nodeFs: typeof import('node:fs') = loadBuiltin(
  'node:fs',
  isBun || isNode,
);
const nodeOs: typeof import('node:os') = loadBuiltin(
  'node:os',
  isBun || isNode,
);

//#region Error Classes
/**
 * Base error class for file operation errors in the compat package.
 *
 * Extends {@link CompatError} to include file-specific context such as the path
 * and operation that caused the error. All file-related errors should extend this class.
 *
 * @extends CompatError
 *
 * @property {string} path - The file or directory path involved in the operation
 * @property {string} operation - The operation that was being performed (e.g., 'read', 'write', 'delete')
 *
 * @example
 * ```ts
 * throw new FileOperationError('Operation failed', '/path/to/file', 'read');
 * ```
 */
export class FileOperationError extends CompatError {
  /** The file or directory path involved in the operation */
  public readonly path: string;
  /** The operation that was being performed */
  public readonly operation: string;

  /**
   * Creates a new FileOperationError.
   *
   * @param message - Human-readable error message
   * @param path - The file or directory path involved
   * @param operation - The operation being performed
   * @param cause - Optional underlying error that caused this error
   */
  constructor(
    message: string,
    path: string,
    operation: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.path = path;
    this.operation = operation;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  override toJSON(): Record<string, unknown> {
    const base = super.toJSON();
    return {
      ...base,
      operation: this.operation,
      path: this.path,
    };
  }
}

/**
 * Error thrown when a file or directory cannot be found at the specified path.
 *
 * This error is thrown when attempting operations on non-existent files or directories.
 * Corresponds to ENOENT error codes in Node.js and NotFound in Deno.
 *
 * @extends FileOperationError
 *
 * @example
 * ```ts
 * throw new FileNotFound('/path/to/missing/file.txt', 'read');
 * ```
 */
export class FileNotFound extends FileOperationError {
  /**
   * Creates a new FileNotFound error.
   *
   * @param path - The path that was not found
   * @param operation - The operation that was attempted
   * @param cause - Optional underlying error
   */
  constructor(path: string, operation: string, cause?: Error) {
    super(`File or directory not found: ${path}`, path, operation, cause);
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when attempting to create a file or directory that already exists.
 *
 * This error is thrown during creation operations when the target already exists
 * and overwriting is not allowed. Corresponds to EEXIST in Node.js and AlreadyExists in Deno.
 *
 * @extends FileOperationError
 *
 * @example
 * ```ts
 * throw new FileAlreadyExists('/path/to/existing/file.txt', 'create');
 * ```
 */
export class FileAlreadyExists extends FileOperationError {
  /**
   * Creates a new FileAlreadyExists error.
   *
   * @param path - The path that already exists
   * @param operation - The operation that was attempted
   * @param cause - Optional underlying error
   */
  constructor(path: string, operation: string, cause?: Error) {
    super(`File or directory already exists: ${path}`, path, operation, cause);
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when access to a file or directory is denied due to insufficient permissions.
 *
 * This error is thrown when the process lacks the necessary permissions to perform
 * the requested operation. Corresponds to EACCES/EPERM in Node.js and PermissionDenied in Deno.
 *
 * @extends FileOperationError
 *
 * @example
 * ```ts
 * throw new FileAccessDenied('/root/protected.txt', 'read');
 * ```
 */
export class FileAccessDenied extends FileOperationError {
  /**
   * Creates a new FileAccessDenied error.
   *
   * @param path - The path that could not be accessed
   * @param operation - The operation that was denied
   * @param cause - Optional underlying error
   */
  constructor(path: string, operation: string, cause?: Error) {
    super(`Access denied: ${path}`, path, operation, cause);
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a provided path is invalid or malformed.
 *
 * This error is thrown for paths that are empty, contain null bytes,
 * or are otherwise invalid according to the operation's requirements.
 *
 * @extends FileOperationError
 *
 * @example
 * ```ts
 * throw new FileInvalidPath('', 'read', 'path cannot be empty');
 * ```
 */
export class FileInvalidPath extends FileOperationError {
  /**
   * Creates a new FileInvalidPath error.
   *
   * @param path - The invalid path
   * @param operation - The operation that was attempted
   * @param reason - Description of why the path is invalid
   * @param cause - Optional underlying error
   */
  constructor(path: string, operation: string, reason: string, cause?: Error) {
    super(
      `Invalid path for ${operation}: ${path} (${reason})`,
      path,
      operation,
      cause,
    );
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when an operation expects a different file system type than what exists.
 *
 * This error is thrown when attempting file operations on a directory or vice versa.
 * For example, trying to read a directory as a file, or create a file where a directory exists.
 * Corresponds to EISDIR/ENOTDIR in Node.js.
 *
 * @extends FileOperationError
 *
 * @example
 * ```ts
 * throw new FileTypeMismatch('/path/to/directory', 'readFile', 'file', 'directory');
 * ```
 */
export class FileTypeMismatch extends FileOperationError {
  /**
   * Creates a new FileTypeMismatch error.
   *
   * @param path - The path with the type mismatch
   * @param operation - The operation that was attempted
   * @param expected - The expected type ('file' or 'directory')
   * @param actual - The actual type that was found
   * @param cause - Optional underlying error
   */
  constructor(
    path: string,
    operation: string,
    expected: string,
    actual: string,
    cause?: Error,
  ) {
    super(
      `Expected ${expected} but found ${actual}: ${path}`,
      path,
      operation,
      cause,
    );
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
//#endregion Error Classes

//#region Path Validation
/**
 * Validates that a path is not empty and doesn't contain null bytes.
 *
 * Performs basic validation to ensure the path is a non-empty string without
 * null bytes, which are invalid in file paths across all platforms.
 *
 * @param path - The path to validate
 * @param operation - The operation being performed (used in error messages)
 * @throws {FileInvalidPath} If the path is invalid (empty, not a string, or contains null bytes)
 *
 * @example
 * ```ts
 * validatePath('/path/to/file.txt', 'read'); // OK
 * validatePath('', 'read'); // Throws FileInvalidPath
 * validatePath('path\0with\0null', 'read'); // Throws FileInvalidPath
 * ```
 */
const validatePath = (pathStr: string, operation: string): void => {
  if (!pathStr || typeof pathStr !== 'string') {
    throw new FileInvalidPath(
      String(pathStr),
      operation,
      'path must be a non-empty string',
    );
  }

  if (pathStr.trim().length === 0) {
    throw new FileInvalidPath(
      pathStr,
      operation,
      'path cannot be empty or whitespace',
    );
  }

  if (pathStr.includes('\0')) {
    throw new FileInvalidPath(
      pathStr,
      operation,
      'path cannot contain null bytes',
    );
  }

  // Path-traversal / sandboxing is intentionally NOT enforced here. A
  // general-purpose file primitive has no notion of an "allowed root", and
  // the previous `..`-based heuristic both rejected legitimate relative
  // paths (e.g. `../sibling`) and was trivially bypassed by absolute paths
  // (`/etc/passwd`) — a security control that only surprised well-behaved
  // callers. Code that must confine access to a directory should resolve
  // and check paths against its own root before calling.

  // Check path length (Windows: 260, Unix: 4096)
  const maxLength = OS === 'WINDOWS' ? 260 : 4096;
  if (pathStr.length > maxLength) {
    throw new FileInvalidPath(
      pathStr,
      operation,
      `path too long (max ${maxLength} characters)`,
    );
  }
};

/**
 * Wraps a native runtime error into a custom FileOperationError subclass.
 *
 * Maps error codes from different runtimes (Deno, Node.js, Bun) to the appropriate
 * custom error type. This provides consistent error handling across all runtimes.
 *
 * Mapped error codes:
 * - ENOENT/NotFound → {@link FileNotFound}
 * - EEXIST/AlreadyExists → {@link FileAlreadyExists}
 * - EACCES/EPERM/PermissionDenied → {@link FileAccessDenied}
 * - EISDIR → {@link FileTypeMismatch} (expected file, found directory)
 * - ENOTDIR → {@link FileTypeMismatch} (expected directory, found file)
 * - Others → {@link FileOperationError}
 *
 * @param error - The original error from the runtime
 * @param path - The file path involved in the operation
 * @param operation - The operation being performed
 * @returns A custom FileOperationError subclass appropriate for the error
 *
 * @example
 * ```ts
 * try {
 *   await Deno.readTextFile('/missing/file.txt');
 * } catch (err) {
 *   throw wrapFileError(err, '/missing/file.txt', 'read');
 *   // Returns FileNotFound instance
 * }
 * ```
 */
const wrapFileError = (
  error: unknown,
  path: string,
  operation: string,
): FileOperationError => {
  if (error instanceof FileOperationError) {
    return error;
  }

  const errorObj = error as { code?: string; message?: string; name: string };
  const code = errorObj.code ?? errorObj.name;
  const message = errorObj.message || String(error);

  switch (code) {
    case 'ENOENT':
    case 'NotFound':
      return new FileNotFound(path, operation, error as Error);

    case 'EEXIST':
    case 'AlreadyExists':
      return new FileAlreadyExists(path, operation, error as Error);

    case 'EACCES':
    case 'EPERM':
    case 'PermissionDenied':
    case 'NotCapable':
      return new FileAccessDenied(path, operation, error as Error);

    case 'EISDIR':
      return new FileTypeMismatch(
        path,
        operation,
        'file',
        'directory',
        error as Error,
      );

    case 'ENOTDIR':
      return new FileTypeMismatch(
        path,
        operation,
        'directory',
        'file',
        error as Error,
      );

    default:
      return new FileOperationError(
        `${operation} failed: ${message}`,
        path,
        operation,
        error as Error,
      );
  }
};
//#endregion Path Validation

//#region File existence checks
/**
 * Checks if a file or directory exists at the given path.
 *
 * **Error Handling:** Returns `false` for non-existent paths instead of throwing.
 * Only throws for invalid paths or permission issues.
 *
 * Works across all runtimes (Deno, Bun, Node.js) and returns false
 * instead of throwing for non-existent paths.
 *
 * @param path - The path to check
 * @returns Promise resolving to true if the path exists, false otherwise
 *
 * @throws {FileInvalidPath} If the path is invalid
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * if (await pathExists('/path/to/file.txt')) {
 *   console.log('File exists');
 * }
 * ```
 */
export const pathExists: (path: string) => Promise<boolean> = async (
  path: string,
): Promise<boolean> => {
  try {
    validatePath(path, 'pathExists');

    if (isDeno) {
      try {
        await Deno.stat(path);
        return true;
      } catch (error) {
        const err = error as { code?: string; name?: string };
        if (err.code === 'NotFound' || err.name === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'pathExists');
      }
    } else if (isBun || isNode) {
      return await nodeFs.promises.access(path, nodeFs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'pathExists');
  }
};

/**
 * Synchronously checks if a file or directory exists at the given path.
 *
 * Works across all runtimes (Deno, Bun, Node.js) and returns false
 * instead of throwing for non-existent paths.
 *
 * @param path - The path to check
 * @returns True if the path exists, false otherwise
 *
 * @example
 * ```ts
 * if (pathExistsSync('/path/to/file.txt')) {
 *   console.log('File exists');
 * }
 * ```
 */
export const pathExistsSync: (path: string) => boolean = (
  path: string,
): boolean => {
  try {
    validatePath(path, 'pathExistsSync');

    if (isDeno) {
      try {
        Deno.statSync(path);
        return true;
      } catch (error) {
        const err = error as { code?: string; name?: string };
        if (err.code === 'NotFound' || err.name === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'pathExistsSync');
      }
    } else if (isBun || isNode) {
      try {
        nodeFs.accessSync(path, nodeFs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'pathExistsSync');
  }
};

/**
 * Checks if the given path exists and is a file (not a directory).
 *
 * @param path - The path to check
 * @returns Promise resolving to true if the path exists and is a file, false otherwise
 *
 * @example
 * ```ts
 * if (await isFile('/path/to/file.txt')) {
 *   console.log('It is a file');
 * }
 * ```
 */
export const isFile: (path: string) => Promise<boolean> = async (
  path: string,
): Promise<boolean> => {
  try {
    validatePath(path, 'isFile');

    if (isDeno) {
      try {
        const stat = await Deno.stat(path);
        return stat.isFile;
      } catch (error) {
        if ((error as { code?: string }).code === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'isFile');
      }
    } else if (isBun || isNode) {
      try {
        const stat = await nodeFs.promises.stat(path);
        return stat.isFile();
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          return false;
        }
        throw wrapFileError(error, path, 'isFile');
      }
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'isFile');
  }
};

/**
 * Synchronously checks if the given path exists and is a file (not a directory).
 *
 * @param path - The path to check
 * @returns True if the path exists and is a file, false otherwise
 *
 * @example
 * ```ts
 * if (isFileSync('/path/to/file.txt')) {
 *   console.log('It is a file');
 * }
 * ```
 */
export const isFileSync: (path: string) => boolean = (
  path: string,
): boolean => {
  try {
    validatePath(path, 'isFileSync');

    if (isDeno) {
      try {
        const stat = Deno.statSync(path);
        return stat.isFile;
      } catch (error) {
        if ((error as { code?: string }).code === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'isFileSync');
      }
    } else if (isBun || isNode) {
      try {
        const stat = nodeFs.statSync(path);
        return stat.isFile();
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          return false;
        }
        throw wrapFileError(error, path, 'isFileSync');
      }
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'isFileSync');
  }
};

/**
 * Checks if the given path exists and is a directory (not a file).
 *
 * @param path - The path to check
 * @returns Promise resolving to true if the path exists and is a directory, false otherwise
 *
 * @example
 * ```ts
 * if (await isDirectory('/path/to/dir')) {
 *   console.log('It is a directory');
 * }
 * ```
 */
export const isDirectory: (path: string) => Promise<boolean> = async (
  path: string,
): Promise<boolean> => {
  try {
    validatePath(path, 'isDirectory');

    if (isDeno) {
      try {
        const stat = await Deno.stat(path);
        return stat.isDirectory;
      } catch (error) {
        if ((error as { code?: string }).code === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'isDirectory');
      }
    } else if (isBun || isNode) {
      try {
        const stat = await nodeFs.promises.stat(path);
        return stat.isDirectory();
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          return false;
        }
        throw wrapFileError(error, path, 'isDirectory');
      }
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'isDirectory');
  }
};

/**
 * Alias for {@link isDirectory}.
 *
 * @example
 * ```ts
 * if (await isDir('/path/to/dir')) {
 *   console.log('It is a directory');
 * }
 * ```
 */
export const isDir = isDirectory;

/**
 * Synchronously checks if the given path exists and is a directory (not a file).
 *
 * @param path - The path to check
 * @returns True if the path exists and is a directory, false otherwise
 *
 * @example
 * ```ts
 * if (isDirectorySync('/path/to/dir')) {
 *   console.log('It is a directory');
 * }
 * ```
 */
export const isDirectorySync: (path: string) => boolean = (
  path: string,
): boolean => {
  try {
    validatePath(path, 'isDirectorySync');

    if (isDeno) {
      try {
        const stat = Deno.statSync(path);
        return stat.isDirectory;
      } catch (error) {
        if ((error as { code?: string }).code === 'NotFound') {
          return false;
        }
        throw wrapFileError(error, path, 'isDirectorySync');
      }
    } else if (isBun || isNode) {
      try {
        const stat = nodeFs.statSync(path);
        return stat.isDirectory();
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          return false;
        }
        throw wrapFileError(error, path, 'isDirectorySync');
      }
    }

    return false;
  } catch (error) {
    if (error instanceof FileInvalidPath) {
      throw error;
    }
    throw wrapFileError(error, path, 'isDirectorySync');
  }
};

/**
 * Alias for {@link isDirectorySync}.
 *
 * @example
 * ```ts
 * if (isDirSync('/path/to/dir')) {
 *   console.log('It is a directory');
 * }
 * ```
 */
export const isDirSync = isDirectorySync;
//#endregion File existence checks

//#region File metadata operations
/**
 * File or directory metadata information.
 */
export type FileInfo = {
  /** Whether this is a file */
  isFile: boolean;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Whether this is a symbolic link */
  isSymlink: boolean;
  /** File size in bytes */
  size: number;
  /** Last modification time */
  mtime: Date | null;
  /** Last access time */
  atime: Date | null;
  /** Creation time (birthtime) */
  birthtime: Date | null;
  /** File mode (permissions) */
  mode: number | null;
  /** User ID of the owner (Unix-like systems only) */
  uid: number | null;
  /** Group ID of the owner (Unix-like systems only) */
  gid: number | null;
};

/**
 * Gets metadata information about a file or directory.
 *
 * @param path - The path to the file or directory
 * @returns Promise resolving to file metadata
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const info = await stat('/path/to/file.txt');
 * console.log(`File size: ${info.size} bytes`);
 * console.log(`Last modified: ${info.mtime}`);
 * ```
 */
export const stat: (path: string) => Promise<FileInfo> = async (
  path: string,
): Promise<FileInfo> => {
  try {
    validatePath(path, 'stat');

    if (isDeno) {
      const info = await Deno.stat(path);
      return {
        isFile: info.isFile,
        isDirectory: info.isDirectory,
        isSymlink: info.isSymlink,
        size: info.size,
        mtime: info.mtime,
        atime: info.atime,
        birthtime: info.birthtime,
        mode: info.mode ?? null,
        uid: info.uid ?? null,
        gid: info.gid ?? null,
      };
    } else if (isBun || isNode) {
      const info = await nodeFs.promises.stat(path);
      return {
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymlink: info.isSymbolicLink(),
        size: info.size,
        mtime: info.mtime,
        atime: info.atime,
        birthtime: info.birthtime,
        mode: info.mode,
        uid: info.uid,
        gid: info.gid,
      };
    }

    throw new FileOperationError('Unsupported runtime', path, 'stat');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'stat');
  }
};

/**
 * Synchronously gets metadata information about a file or directory.
 *
 * @param path - The path to the file or directory
 * @returns File metadata
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const info = statSync('/path/to/file.txt');
 * console.log(`File size: ${info.size} bytes`);
 * console.log(`Last modified: ${info.mtime}`);
 * ```
 */
export const statSync: (path: string) => FileInfo = (
  path: string,
): FileInfo => {
  try {
    validatePath(path, 'statSync');

    if (isDeno) {
      const info = Deno.statSync(path);
      return {
        isFile: info.isFile,
        isDirectory: info.isDirectory,
        isSymlink: info.isSymlink,
        size: info.size,
        mtime: info.mtime,
        atime: info.atime,
        birthtime: info.birthtime,
        mode: info.mode ?? null,
        uid: info.uid ?? null,
        gid: info.gid ?? null,
      };
    } else if (isBun || isNode) {
      const info = nodeFs.statSync(path);
      return {
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymlink: info.isSymbolicLink(),
        size: info.size,
        mtime: info.mtime,
        atime: info.atime,
        birthtime: info.birthtime,
        mode: info.mode,
        uid: info.uid,
        gid: info.gid,
      };
    }

    throw new FileOperationError('Unsupported runtime', path, 'statSync');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'statSync');
  }
};
//#endregion File metadata operations

//#region File operations
/**
 * Options for writing files.
 */
export type WriteOptions = {
  /** Whether to append to the file instead of overwriting. Defaults to false. */
  append?: boolean;
  /** Whether to create the file if it doesn't exist. Defaults to true. */
  create?: boolean;
  /** File mode (permissions), e.g., 0o644 for rw-r--r--. */
  mode?: number;
};

/**
 * Reads the entire contents of a file as a Uint8Array.
 *
 * @param path - The path to the file to read
 * @returns Promise resolving to the file contents as Uint8Array
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * const data = await readFile('/path/to/file.bin');
 * console.log(`Read ${data.length} bytes`);
 * ```
 */
export const readFile: (path: string) => Promise<Uint8Array> = async (
  path: string,
): Promise<Uint8Array> => {
  try {
    validatePath(path, 'readFile');

    if (isDeno) {
      return await Deno.readFile(path);
    } else if (isBun) {
      return await Bun.file(path).bytes();
    } else if (isNode) {
      const buffer = await nodeFs.promises.readFile(path);
      return new Uint8Array(buffer);
    }

    throw new FileOperationError('Unsupported runtime', path, 'readFile');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'readFile');
  }
};

/**
 * Synchronously reads the entire contents of a file as a Uint8Array.
 *
 * @param path - The path to the file to read
 * @returns The file contents as Uint8Array
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * const data = readFileSync('/path/to/file.bin');
 * console.log(`Read ${data.length} bytes`);
 * ```
 */
export const readFileSync: (path: string) => Uint8Array = (
  path: string,
): Uint8Array => {
  try {
    validatePath(path, 'readFileSync');

    if (isDeno) {
      return Deno.readFileSync(path);
    } else if (isBun || isNode) {
      const buffer = nodeFs.readFileSync(path);
      return new Uint8Array(buffer);
    }

    throw new FileOperationError('Unsupported runtime', path, 'readFileSync');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'readFileSync');
  }
};

/**
 * Reads the entire contents of a file as a UTF-8 string.
 *
 * @param path - The path to the file to read
 * @returns Promise resolving to the file contents as string
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * const content = await readTextFile('/path/to/file.txt');
 * console.log(content);
 * ```
 */
export const readTextFile: (path: string) => Promise<string> = async (
  path: string,
): Promise<string> => {
  try {
    validatePath(path, 'readTextFile');

    if (isDeno) {
      return await Deno.readTextFile(path);
    } else if (isBun) {
      return await Bun.file(path).text();
    } else if (isNode) {
      return await nodeFs.promises.readFile(path, 'utf-8');
    }

    throw new FileOperationError('Unsupported runtime', path, 'readTextFile');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'readTextFile');
  }
};

/**
 * Synchronously reads the entire contents of a file as a UTF-8 string.
 *
 * @param path - The path to the file to read
 * @returns The file contents as string
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * const content = readTextFileSync('/path/to/file.txt');
 * console.log(content);
 * ```
 */
export const readTextFileSync: (path: string) => string = (
  path: string,
): string => {
  try {
    validatePath(path, 'readTextFileSync');

    if (isDeno) {
      return Deno.readTextFileSync(path);
    } else if (isBun || isNode) {
      return nodeFs.readFileSync(path, 'utf-8');
    }

    throw new FileOperationError(
      'Unsupported runtime',
      path,
      'readTextFileSync',
    );
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'readTextFileSync');
  }
};

/**
 * Reads and parses a JSON file.
 *
 * @template T - The expected type of the JSON data
 * @param path - The path to the JSON file
 * @returns Promise resolving to the parsed JSON data
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {SyntaxError} If the file contains invalid JSON
 *
 * @example
 * ```ts
 * type Config = { port: number; host: string };
 * const config = await readJSONFile<Config>('/path/to/config.json');
 * console.log(config.port);
 * ```
 */
export const readJSONFile: <
  T extends Record<string, unknown> = Record<string, unknown>,
>(path: string) => Promise<T> = async <
  T extends Record<string, unknown> = Record<string, unknown>,
>(path: string): Promise<T> => {
  try {
    const content = await readTextFile(path);
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new FileOperationError(
        `Invalid JSON: ${error.message}`,
        path,
        'readJSONFile',
        error,
      );
    }
    throw wrapFileError(error, path, 'readJSONFile');
  }
};

/**
 * Synchronously reads and parses a JSON file.
 *
 * @template T - The expected type of the JSON data
 * @param path - The path to the JSON file
 * @returns The parsed JSON data
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {SyntaxError} If the file contains invalid JSON
 *
 * @example
 * ```ts
 * type Config = { port: number; host: string };
 * const config = readJSONFileSync<Config>('/path/to/config.json');
 * console.log(config.port);
 * ```
 */
export const readJSONFileSync: <
  T extends Record<string, unknown> = Record<string, unknown>,
>(path: string) => T = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(path: string): T => {
  try {
    const content = readTextFileSync(path);
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new FileOperationError(
        `Invalid JSON: ${error.message}`,
        path,
        'readJSONFileSync',
        error,
      );
    }
    throw wrapFileError(error, path, 'readJSONFileSync');
  }
};

/**
 * Writes binary data to a file.
 *
 * Unless `append` is set, the file is truncated to the written content
 * (no stale trailing bytes remain). With `create: false` the file must
 * already exist; missing files throw `FileNotFound` on every runtime
 * rather than being created.
 *
 * @param path - The path to the file to write
 * @param data - The data to write as Uint8Array
 * @param options - Write options (append, create, mode)
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileNotFound} If create is false and the file doesn't exist
 *
 * @example
 * ```ts
 * const data = new Uint8Array([1, 2, 3, 4]);
 * await writeFile('/path/to/file.bin', data);
 *
 * // Append to file
 * await writeFile('/path/to/file.bin', data, { append: true });
 * ```
 */
export const writeFile: (
  path: string,
  data: Uint8Array,
  options?: WriteOptions,
) => Promise<void> = async (
  path: string,
  data: Uint8Array,
  options?: WriteOptions,
): Promise<void> => {
  try {
    validatePath(path, 'writeFile');
    const opts = { append: false, create: true, ...options };

    if (isDeno) {
      await Deno.writeFile(path, data, {
        append: opts.append,
        create: opts.create,
        mode: opts.mode,
      });
    } else if (isBun || isNode) {
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.writeFile({append,create}) exactly. The old string-flag
      // mapping used 'r+' for the create:false case, which opens WITHOUT
      // O_TRUNC — overwriting a longer file with shorter content left
      // stale trailing bytes on Node/Bun while Deno truncated; and 'a'
      // (append) always implies O_CREAT, creating a file the caller
      // asked not to create (create:false) where Deno throws NotFound.
      // Not appending => truncate, matching Deno. See the matching fix
      // in openFile.
      const C = nodeFs.constants;
      let flags = C.O_WRONLY;
      flags |= opts.append ? C.O_APPEND : C.O_TRUNC;
      if (opts.create) flags |= C.O_CREAT;
      // Numeric flags are only accepted by open(), not by the writeFile
      // `flag` string option — open with them, then write and close.
      const handle = await nodeFs.promises.open(path, flags, opts.mode);
      try {
        await handle.writeFile(data);
      } finally {
        await handle.close();
      }
    } else {
      throw new FileOperationError('Unsupported runtime', path, 'writeFile');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'writeFile');
  }
};

/**
 * Synchronously writes binary data to a file.
 *
 * Unless `append` is set, the file is truncated to the written content
 * (no stale trailing bytes remain). With `create: false` the file must
 * already exist; missing files throw `FileNotFound` on every runtime
 * rather than being created.
 *
 * @param path - The path to the file to write
 * @param data - The data to write as Uint8Array
 * @param options - Write options (append, create, mode)
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileNotFound} If create is false and the file doesn't exist
 *
 * @example
 * ```ts
 * const data = new Uint8Array([1, 2, 3, 4]);
 * writeFileSync('/path/to/file.bin', data);
 * ```
 */
export const writeFileSync: (
  path: string,
  data: Uint8Array,
  options?: WriteOptions,
) => void = (path: string, data: Uint8Array, options?: WriteOptions): void => {
  try {
    validatePath(path, 'writeFileSync');
    const opts = { append: false, create: true, ...options };

    if (isDeno) {
      Deno.writeFileSync(path, data, {
        append: opts.append,
        create: opts.create,
        mode: opts.mode,
      });
    } else if (isBun || isNode) {
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.writeFile({append,create}) exactly. The old string-flag
      // mapping used 'r+' for the create:false case, which opens WITHOUT
      // O_TRUNC — overwriting a longer file with shorter content left
      // stale trailing bytes on Node/Bun while Deno truncated; and 'a'
      // (append) always implies O_CREAT, creating a file the caller
      // asked not to create (create:false) where Deno throws NotFound.
      // Not appending => truncate, matching Deno. See the matching fix
      // in openFile.
      const C = nodeFs.constants;
      let flags = C.O_WRONLY;
      flags |= opts.append ? C.O_APPEND : C.O_TRUNC;
      if (opts.create) flags |= C.O_CREAT;
      // Numeric flags are only accepted by openSync(), not by the
      // writeFileSync `flag` string option — open with them, then write
      // and close.
      const fd = nodeFs.openSync(path, flags, opts.mode);
      try {
        nodeFs.writeFileSync(fd, data);
      } finally {
        nodeFs.closeSync(fd);
      }
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        path,
        'writeFileSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'writeFileSync');
  }
};

/**
 * Writes a UTF-8 string to a file.
 *
 * Unless `append` is set, the file is truncated to the written content
 * (no stale trailing bytes remain). With `create: false` the file must
 * already exist; missing files throw `FileNotFound` on every runtime
 * rather than being created.
 *
 * @param path - The path to the file to write
 * @param data - The string data to write
 * @param options - Write options (append, create, mode)
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileNotFound} If create is false and the file doesn't exist
 *
 * @example
 * ```ts
 * await writeTextFile('/path/to/file.txt', 'Hello, World!');
 *
 * // Append to file
 * await writeTextFile('/path/to/file.txt', '\nNew line', { append: true });
 * ```
 */
export const writeTextFile: (
  path: string,
  data: string,
  options?: WriteOptions,
) => Promise<void> = async (
  path: string,
  data: string,
  options?: WriteOptions,
): Promise<void> => {
  try {
    validatePath(path, 'writeTextFile');
    const opts = { append: false, create: true, ...options };

    if (isDeno) {
      await Deno.writeTextFile(path, data, {
        append: opts.append,
        create: opts.create,
        mode: opts.mode,
      });
    } else if (isBun || isNode) {
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.writeFile({append,create}) exactly. The old string-flag
      // mapping used 'r+' for the create:false case, which opens WITHOUT
      // O_TRUNC — overwriting a longer file with shorter content left
      // stale trailing bytes on Node/Bun while Deno truncated; and 'a'
      // (append) always implies O_CREAT, creating a file the caller
      // asked not to create (create:false) where Deno throws NotFound.
      // Not appending => truncate, matching Deno. See the matching fix
      // in openFile.
      const C = nodeFs.constants;
      let flags = C.O_WRONLY;
      flags |= opts.append ? C.O_APPEND : C.O_TRUNC;
      if (opts.create) flags |= C.O_CREAT;
      // Numeric flags are only accepted by open(), not by the writeFile
      // `flag` string option — open with them, then write and close.
      const handle = await nodeFs.promises.open(path, flags, opts.mode);
      try {
        await handle.writeFile(data, { encoding: 'utf-8' });
      } finally {
        await handle.close();
      }
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        path,
        'writeTextFile',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'writeTextFile');
  }
};

/**
 * Synchronously writes a UTF-8 string to a file.
 *
 * Unless `append` is set, the file is truncated to the written content
 * (no stale trailing bytes remain). With `create: false` the file must
 * already exist; missing files throw `FileNotFound` on every runtime
 * rather than being created.
 *
 * @param path - The path to the file to write
 * @param data - The string data to write
 * @param options - Write options (append, create, mode)
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileNotFound} If create is false and the file doesn't exist
 *
 * @example
 * ```ts
 * writeTextFileSync('/path/to/file.txt', 'Hello, World!');
 * ```
 */
export const writeTextFileSync: (
  path: string,
  data: string,
  options?: WriteOptions,
) => void = (path: string, data: string, options?: WriteOptions): void => {
  try {
    validatePath(path, 'writeTextFileSync');
    const opts = { append: false, create: true, ...options };

    if (isDeno) {
      Deno.writeTextFileSync(path, data, {
        append: opts.append,
        create: opts.create,
        mode: opts.mode,
      });
    } else if (isBun || isNode) {
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.writeFile({append,create}) exactly. The old string-flag
      // mapping used 'r+' for the create:false case, which opens WITHOUT
      // O_TRUNC — overwriting a longer file with shorter content left
      // stale trailing bytes on Node/Bun while Deno truncated; and 'a'
      // (append) always implies O_CREAT, creating a file the caller
      // asked not to create (create:false) where Deno throws NotFound.
      // Not appending => truncate, matching Deno. See the matching fix
      // in openFile.
      const C = nodeFs.constants;
      let flags = C.O_WRONLY;
      flags |= opts.append ? C.O_APPEND : C.O_TRUNC;
      if (opts.create) flags |= C.O_CREAT;
      // Numeric flags are only accepted by openSync(), not by the
      // writeFileSync `flag` string option — open with them, then write
      // and close.
      const fd = nodeFs.openSync(path, flags, opts.mode);
      try {
        nodeFs.writeFileSync(fd, data, { encoding: 'utf-8' });
      } finally {
        nodeFs.closeSync(fd);
      }
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        path,
        'writeTextFileSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'writeTextFileSync');
  }
};

/**
 * Writes an object as JSON to a file.
 *
 * @param path - The path to the file to write
 * @param data - The object to serialize as JSON
 * @param options - Write options (append, create, mode) plus optional space formatting
 * @throws {FileAccessDenied} If permission is denied
 * @throws {TypeError} If the data cannot be serialized to JSON
 *
 * @example
 * ```ts
 * const config = { port: 3000, host: 'localhost' };
 * await writeJSONFile('/path/to/config.json', config);
 *
 * // Pretty print with 2 spaces
 * await writeJSONFile('/path/to/config.json', config, { space: 2 });
 * ```
 */
export const writeJSONFile: (
  path: string,
  data: Record<string, unknown>,
  options?: WriteOptions & { space?: number | string },
) => Promise<void> = async (
  path: string,
  data: Record<string, unknown>,
  options?: WriteOptions & { space?: number | string },
): Promise<void> => {
  try {
    const { space, ...writeOpts } = options ?? {};
    const json = JSON.stringify(data, null, space);
    await writeTextFile(path, json, writeOpts);
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new FileOperationError(
        `Cannot serialize to JSON: ${error.message}`,
        path,
        'writeJSONFile',
        error,
      );
    }
    throw wrapFileError(error, path, 'writeJSONFile');
  }
};

/**
 * Synchronously writes an object as JSON to a file.
 *
 * @param path - The path to the file to write
 * @param data - The object to serialize as JSON
 * @param options - Write options (append, create, mode) plus optional space formatting
 * @throws {FileAccessDenied} If permission is denied
 * @throws {TypeError} If the data cannot be serialized to JSON
 *
 * @example
 * ```ts
 * const config = { port: 3000, host: 'localhost' };
 * writeJSONFileSync('/path/to/config.json', config, { space: 2 });
 * ```
 */
export const writeJSONFileSync: (
  path: string,
  data: Record<string, unknown>,
  options?: WriteOptions & { space?: number | string },
) => void = (
  path: string,
  data: Record<string, unknown>,
  options?: WriteOptions & { space?: number | string },
): void => {
  try {
    const { space, ...writeOpts } = options ?? {};
    const json = JSON.stringify(data, null, space);
    writeTextFileSync(path, json, writeOpts);
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new FileOperationError(
        `Cannot serialize to JSON: ${error.message}`,
        path,
        'writeJSONFileSync',
        error,
      );
    }
    throw wrapFileError(error, path, 'writeJSONFileSync');
  }
};

/**
 * Deletes a file at the specified path.
 *
 * @param path - The path to the file to delete
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * await deleteFile('/path/to/file.txt');
 * ```
 */
export const deleteFile: (path: string) => Promise<void> = async (
  path: string,
): Promise<void> => {
  try {
    validatePath(path, 'deleteFile');

    if (isDeno) {
      await Deno.remove(path);
    } else if (isBun || isNode) {
      await nodeFs.promises.unlink(path);
    } else {
      throw new FileOperationError('Unsupported runtime', path, 'deleteFile');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'deleteFile');
  }
};

/**
 * Synchronously deletes a file at the specified path.
 *
 * @param path - The path to the file to delete
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is a directory
 *
 * @example
 * ```ts
 * deleteFileSync('/path/to/file.txt');
 * ```
 */
export const deleteFileSync: (path: string) => void = (path: string): void => {
  try {
    validatePath(path, 'deleteFileSync');

    if (isDeno) {
      Deno.removeSync(path);
    } else if (isBun || isNode) {
      nodeFs.unlinkSync(path);
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        path,
        'deleteFileSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, path, 'deleteFileSync');
  }
};

/**
 * Ensures a file exists, creating it (and parent directories) if needed.
 * If the file already exists, does nothing. If it doesn't exist, creates an empty file.
 *
 * @param path - The path to the file to ensure exists
 * @param options - Options for file creation
 * @param options.mode - File mode (permissions), e.g., 0o644
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path exists but is not a file
 *
 * @example
 * ```ts
 * await ensureFile('/path/to/file.txt');
 * await ensureFile('/path/to/nested/file.txt', { mode: 0o644 });
 * ```
 */
export const ensureFile: (
  path: string,
  options?: { mode?: number },
) => Promise<void> = async (
  filePath: string,
  options?: { mode?: number },
): Promise<void> => { // NOSONAR - complexity will be there.
  try {
    validatePath(filePath, 'ensureFile');

    // Try to create the file exclusively (fail if exists)
    try {
      if (isDeno) {
        await Deno.writeFile(filePath, new Uint8Array(0), {
          createNew: true,
          mode: options?.mode,
        });
      } else if (isBun || isNode) {
        await nodeFs.promises.writeFile(filePath, new Uint8Array(0), {
          flag: 'wx', // Exclusive creation - fails if file exists
          mode: options?.mode,
        });
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          filePath,
          'ensureFile',
        );
      }
    } catch (error) {
      // Check if file already exists
      if (
        error && typeof error === 'object' &&
        (
          ('name' in error && error.name === 'AlreadyExists') || // Deno
          ('code' in error && error.code === 'EEXIST') // Node/Bun
        )
      ) {
        // File exists - verify it's actually a file, not a directory
        if (!await isFile(filePath)) {
          throw new FileTypeMismatch(
            filePath,
            'ensureFile',
            'file',
            'directory',
          );
        }
        return;
      }

      // Check if parent directory doesn't exist
      if (
        error && typeof error === 'object' &&
        (
          ('name' in error && error.name === 'NotFound') || // Deno
          ('code' in error && error.code === 'ENOENT') // Node/Bun
        )
      ) {
        // Create parent directory and retry
        const dir = path.dirname(filePath);
        await ensureDir(dir);

        // Retry file creation
        if (isDeno) {
          await Deno.writeFile(filePath, new Uint8Array(0), {
            createNew: true,
            mode: options?.mode,
          });
        } else if (isBun || isNode) {
          await nodeFs.promises.writeFile(filePath, new Uint8Array(0), {
            flag: 'wx',
            mode: options?.mode,
          });
        }
        return;
      }

      // Other error - rethrow
      throw error;
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'ensureFile');
  }
};

/**
 * Synchronously ensures a file exists, creating it (and parent directories) if needed.
 * If the file already exists, does nothing. If it doesn't exist, creates an empty file.
 *
 * @param path - The path to the file to ensure exists
 * @param options - Options for file creation
 * @param options.mode - File mode (permissions), e.g., 0o644
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path exists but is not a file
 *
 * @example
 * ```ts
 * ensureFileSync('/path/to/file.txt');
 * ensureFileSync('/path/to/nested/file.txt', { mode: 0o644 });
 * ```
 */
export const ensureFileSync: (
  path: string,
  options?: { mode?: number },
) => void = (filePath: string, options?: { mode?: number }): void => { // NOSONAR - complexity will be there.
  try {
    validatePath(filePath, 'ensureFileSync');

    // Try to create the file exclusively (fail if exists)
    try {
      if (isDeno) {
        Deno.writeFileSync(filePath, new Uint8Array(0), {
          createNew: true,
          mode: options?.mode,
        });
      } else if (isBun || isNode) {
        nodeFs.writeFileSync(filePath, new Uint8Array(0), {
          flag: 'wx', // Exclusive creation - fails if file exists
          mode: options?.mode,
        });
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          filePath,
          'ensureFileSync',
        );
      }
    } catch (error) {
      // Check if file already exists
      if (
        error && typeof error === 'object' &&
        (
          ('name' in error && error.name === 'AlreadyExists') || // Deno
          ('code' in error && error.code === 'EEXIST') // Node/Bun
        )
      ) {
        // File exists - verify it's actually a file, not a directory
        if (!isFileSync(filePath)) {
          throw new FileTypeMismatch(
            filePath,
            'ensureFileSync',
            'file',
            'directory',
          );
        }
        return;
      }

      // Check if parent directory doesn't exist
      if (
        error && typeof error === 'object' &&
        (
          ('name' in error && error.name === 'NotFound') || // Deno
          ('code' in error && error.code === 'ENOENT') // Node/Bun
        )
      ) {
        // Create parent directory and retry
        const dir = path.dirname(filePath);
        ensureDirSync(dir);

        // Retry file creation
        if (isDeno) {
          Deno.writeFileSync(filePath, new Uint8Array(0), {
            createNew: true,
            mode: options?.mode,
          });
        } else if (isBun || isNode) {
          nodeFs.writeFileSync(filePath, new Uint8Array(0), {
            flag: 'wx',
            mode: options?.mode,
          });
        }
        return;
      }

      // Other error - rethrow
      throw error;
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'ensureFileSync');
  }
};

/**
 * Copies a file from source to destination.
 *
 * @param src - The source file path
 * @param dest - The destination file path
 * @throws {FileNotFound} If the source file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * await copyFile('/path/to/source.txt', '/path/to/dest.txt');
 * ```
 */
export const copyFile: (src: string, dest: string) => Promise<void> = async (
  src: string,
  dest: string,
): Promise<void> => {
  try {
    validatePath(src, 'copyFile');
    validatePath(dest, 'copyFile');

    if (isDeno) {
      await Deno.copyFile(src, dest);
    } else if (isBun || isNode) {
      await nodeFs.promises.copyFile(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'copyFile');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'copyFile');
  }
};

/**
 * Synchronously copies a file from source to destination.
 *
 * @param src - The source file path
 * @param dest - The destination file path
 * @throws {FileNotFound} If the source file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * copyFileSync('/path/to/source.txt', '/path/to/dest.txt');
 * ```
 */
export const copyFileSync: (src: string, dest: string) => void = (
  src: string,
  dest: string,
): void => {
  try {
    validatePath(src, 'copyFileSync');
    validatePath(dest, 'copyFileSync');

    if (isDeno) {
      Deno.copyFileSync(src, dest);
    } else if (isBun || isNode) {
      nodeFs.copyFileSync(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'copyFileSync');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'copyFileSync');
  }
};

/**
 * Moves a file from source to destination (rename across directories).
 *
 * @param src - The source file path
 * @param dest - The destination file path
 * @throws {FileNotFound} If the source file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * await moveFile('/path/to/source.txt', '/another/path/dest.txt');
 * ```
 */
export const moveFile: (src: string, dest: string) => Promise<void> = async (
  src: string,
  dest: string,
): Promise<void> => {
  try {
    validatePath(src, 'moveFile');
    validatePath(dest, 'moveFile');

    if (isDeno) {
      await Deno.rename(src, dest);
    } else if (isBun || isNode) {
      await nodeFs.promises.rename(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'moveFile');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'moveFile');
  }
};

/**
 * Synchronously moves a file from source to destination (rename across directories).
 *
 * @param src - The source file path
 * @param dest - The destination file path
 * @throws {FileNotFound} If the source file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * moveFileSync('/path/to/source.txt', '/another/path/dest.txt');
 * ```
 */
export const moveFileSync: (src: string, dest: string) => void = (
  src: string,
  dest: string,
): void => {
  try {
    validatePath(src, 'moveFileSync');
    validatePath(dest, 'moveFileSync');

    if (isDeno) {
      Deno.renameSync(src, dest);
    } else if (isBun || isNode) {
      nodeFs.renameSync(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'moveFileSync');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'moveFileSync');
  }
};

/**
 * Renames a file in the same directory.
 *
 * @param filePath - The path to the file to rename
 * @param newName - The new name for the file (not a full path, just the name)
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If a file with the new name already exists
 *
 * @example
 * ```ts
 * await renameFile('/path/to/oldname.txt', 'newname.txt');
 * // Result: /path/to/newname.txt
 * ```
 */
export const renameFile: (filePath: string, newName: string) => Promise<void> =
  async (filePath: string, newName: string): Promise<void> => {
    try {
      validatePath(filePath, 'renameFile');
      validatePath(newName, 'renameFile');

      // Extract directory and construct new path using path compat layer
      const newPath = path.join(path.dirname(filePath), newName);

      if (isDeno) {
        await Deno.rename(filePath, newPath);
      } else if (isBun || isNode) {
        await nodeFs.promises.rename(filePath, newPath);
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          filePath,
          'renameFile',
        );
      }
    } catch (error) {
      if (error instanceof FileOperationError) {
        throw error;
      }
      throw wrapFileError(error, filePath, 'renameFile');
    }
  };

/**
 * Synchronously renames a file in the same directory.
 *
 * @param filePath - The path to the file to rename
 * @param newName - The new name for the file (not a full path, just the name)
 * @throws {FileNotFound} If the file doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If a file with the new name already exists
 *
 * @example
 * ```ts
 * renameFileSync('/path/to/oldname.txt', 'newname.txt');
 * // Result: /path/to/newname.txt
 * ```
 */
export const renameFileSync: (filePath: string, newName: string) => void = (
  filePath: string,
  newName: string,
): void => {
  try {
    validatePath(filePath, 'renameFileSync');
    validatePath(newName, 'renameFileSync');

    // Extract directory and construct new path using path compat layer
    const newPath = path.join(path.dirname(filePath), newName);

    if (isDeno) {
      Deno.renameSync(filePath, newPath);
    } else if (isBun || isNode) {
      nodeFs.renameSync(filePath, newPath);
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        filePath,
        'renameFileSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'renameFileSync');
  }
};

/**
 * Resolves a path to its absolute canonical form, resolving symlinks and relative references.
 *
 * @param path - The path to resolve
 * @returns Promise resolving to the canonical absolute path
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const absolutePath = await realPath('./src');
 * console.log(absolutePath); // /home/user/project/src
 * ```
 */
export const realPath: (path: string) => Promise<string> = async (
  targetPath: string,
): Promise<string> => {
  try {
    validatePath(targetPath, 'realPath');

    if (isDeno) {
      return await Deno.realPath(targetPath);
    } else if (isBun || isNode) {
      return await nodeFs.promises.realpath(targetPath);
    }

    throw new FileOperationError('Unsupported runtime', targetPath, 'realPath');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, targetPath, 'realPath');
  }
};

/**
 * Synchronously resolves a path to its absolute canonical form, resolving symlinks and relative references.
 *
 * @param path - The path to resolve
 * @returns The canonical absolute path
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const absolutePath = realPathSync('./src');
 * console.log(absolutePath); // /home/user/project/src
 * ```
 */
export const realPathSync: (path: string) => string = (
  targetPath: string,
): string => {
  try {
    validatePath(targetPath, 'realPathSync');

    if (isDeno) {
      return Deno.realPathSync(targetPath);
    } else if (isBun || isNode) {
      return nodeFs.realpathSync(targetPath);
    }

    throw new FileOperationError(
      'Unsupported runtime',
      targetPath,
      'realPathSync',
    );
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, targetPath, 'realPathSync');
  }
};

//#endregion File operations

//#region Directory operations
/**
 * Represents an entry in a directory listing.
 */
export type DirectoryEntry = {
  /** The name of the file or directory */
  name: string;
  /** The full path to the file or directory */
  path: string;
  /** Whether this entry is a file */
  isFile: boolean;
  /** Whether this entry is a directory */
  isDirectory: boolean;
  /** Whether this entry is a symbolic link */
  isSymlink: boolean;
};

/**
 * Options for filtering directory entries.
 */
export type ReadDirOptions = {
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
};

/**
 * Checks if an entry matches type filters.
 * @internal
 */
const matchesType = (
  entry: DirectoryEntry,
  includeFiles: boolean,
  includeDirs: boolean,
): boolean => {
  if (entry.isFile && !includeFiles) return false;
  if (entry.isDirectory && !includeDirs) return false;
  return true;
};

/**
 * Checks if a file matches extension filters.
 * @internal
 */
const matchesExtension = (
  entry: DirectoryEntry,
  exts?: Array<string>,
): boolean => {
  if (!entry.isFile || !exts || exts.length === 0) return true;
  return exts.some((ext) => entry.name.endsWith(ext));
};

/**
 * Checks if an entry should be skipped based on patterns.
 * @internal
 */
const shouldSkipEntry = (
  entry: DirectoryEntry,
  skip?: Array<RegExp>,
): boolean => {
  if (!skip || skip.length === 0) return false;
  return skip.some((pattern) =>
    pattern.test(entry.path) || pattern.test(entry.name)
  );
};

/**
 * Checks if an entry matches the required patterns.
 * @internal
 */
const matchesPatterns = (
  entry: DirectoryEntry,
  match?: Array<RegExp>,
): boolean => {
  if (!match || match.length === 0) return true;
  return match.some((pattern) =>
    pattern.test(entry.path) || pattern.test(entry.name)
  );
};

/**
 * Reads directory entries from Deno runtime.
 * @internal
 */
async function* readDirDeno(
  dirPath: string,
  filter: (entry: DirectoryEntry) => boolean,
): AsyncIterable<DirectoryEntry> {
  for await (const entry of Deno.readDir(dirPath)) {
    const dirEntry: DirectoryEntry = {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
    };
    if (filter(dirEntry)) yield dirEntry;
  }
}

/**
 * Reads directory entries from Node/Bun runtime.
 * @internal
 */
async function* readDirNode(
  dirPath: string,
  filter: (entry: DirectoryEntry) => boolean,
): AsyncIterable<DirectoryEntry> {
  const entries = await nodeFs.promises.readdir(dirPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const dirEntry: DirectoryEntry = {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink(),
    };
    if (filter(dirEntry)) yield dirEntry;
  }
}

/**
 * Synchronously reads directory entries from Deno runtime.
 * @internal
 */
function* readDirSyncDeno(
  dirPath: string,
  filter: (entry: DirectoryEntry) => boolean,
): Iterable<DirectoryEntry> {
  for (const entry of Deno.readDirSync(dirPath)) {
    const dirEntry: DirectoryEntry = {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
    };
    if (filter(dirEntry)) yield dirEntry;
  }
}

/**
 * Synchronously reads directory entries from Node/Bun runtime.
 * @internal
 */
function* readDirSyncNode(
  dirPath: string,
  filter: (entry: DirectoryEntry) => boolean,
): Iterable<DirectoryEntry> {
  const entries = nodeFs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const dirEntry: DirectoryEntry = {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink(),
    };
    if (filter(dirEntry)) yield dirEntry;
  }
}

/**
 * Creates a filter function for directory entries based on ReadDirOptions.
 * @internal
 */
const createEntryFilter = (
  options?: ReadDirOptions,
): (entry: DirectoryEntry) => boolean => {
  const opts = {
    includeFiles: true,
    includeDirs: true,
    ...options,
  };

  return (entry: DirectoryEntry): boolean => {
    if (!matchesType(entry, opts.includeFiles, opts.includeDirs)) return false;
    if (!matchesExtension(entry, opts.exts)) return false;
    if (shouldSkipEntry(entry, opts.skip)) return false;
    if (!matchesPatterns(entry, opts.match)) return false;
    return true;
  };
};

/**
 * Reads the contents of a directory asynchronously as an async iterable.
 *
 * @param path - The path to the directory
 * @param options - Filtering options for directory entries
 * @returns An async iterable of directory entries
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is not a directory
 *
 * @example
 * ```ts
 * // List all entries
 * for await (const entry of readDir('/path/to/dir')) {
 *   console.log(entry.name, entry.isFile);
 * }
 *
 * // Only TypeScript files
 * for await (const entry of readDir('/path/to/dir', { exts: ['.ts'] })) {
 *   console.log(entry.name);
 * }
 *
 * // Skip test files
 * for await (const entry of readDir('/path/to/dir', { skip: [/\.test\./] })) {
 *   console.log(entry.name);
 * }
 * ```
 */
export const readDir: (
  path: string,
  options?: ReadDirOptions,
) => AsyncIterable<DirectoryEntry> = async function* (
  dirPath: string,
  options?: ReadDirOptions,
): AsyncIterable<DirectoryEntry> {
  try {
    validatePath(dirPath, 'readDir');
    const filter = createEntryFilter(options);

    if (isDeno) {
      yield* readDirDeno(dirPath, filter);
    } else if (isBun || isNode) {
      yield* readDirNode(dirPath, filter);
    } else {
      throw new FileOperationError('Unsupported runtime', dirPath, 'readDir');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'readDir');
  }
};

/**
 * Synchronously reads the contents of a directory as an iterable.
 *
 * @param path - The path to the directory
 * @param options - Filtering options for directory entries
 * @returns An iterable of directory entries
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is not a directory
 *
 * @example
 * ```ts
 * // List all entries
 * for (const entry of readDirSync('/path/to/dir')) {
 *   console.log(entry.name, entry.isFile);
 * }
 *
 * // Only directories
 * for (const entry of readDirSync('/path/to/dir', { includeFiles: false })) {
 *   console.log(entry.name);
 * }
 *
 * // Only .json and .yaml files
 * for (const entry of readDirSync('/path/to/dir', { exts: ['.json', '.yaml'] })) {
 *   console.log(entry.name);
 * }
 * ```
 */
export const readDirSync: (
  path: string,
  options?: ReadDirOptions,
) => Iterable<DirectoryEntry> = function* (
  dirPath: string,
  options?: ReadDirOptions,
): Iterable<DirectoryEntry> {
  try {
    validatePath(dirPath, 'readDirSync');
    const filter = createEntryFilter(options);

    if (isDeno) {
      yield* readDirSyncDeno(dirPath, filter);
    } else if (isBun || isNode) {
      yield* readDirSyncNode(dirPath, filter);
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        dirPath,
        'readDirSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'readDirSync');
  }
};

/**
 * Removes a directory.
 *
 * @param path - The path to the directory
 * @param options - Options for removal
 * @param options.recursive - If true, removes directory and all its contents
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * await removeDir('/path/to/empty-dir');
 * await removeDir('/path/to/dir', { recursive: true }); // Remove with contents
 * ```
 */
export const removeDir: (
  path: string,
  options?: { recursive?: boolean },
) => Promise<void> = async (
  dirPath: string,
  options?: { recursive?: boolean },
): Promise<void> => {
  try {
    validatePath(dirPath, 'removeDir');
    const opts = { recursive: false, ...options };

    if (isDeno) {
      await Deno.remove(dirPath, { recursive: opts.recursive });
    } else if (isBun || isNode) {
      if (opts.recursive) {
        await nodeFs.promises.rm(dirPath, { recursive: true, force: false });
      } else {
        await nodeFs.promises.rmdir(dirPath);
      }
    } else {
      throw new FileOperationError('Unsupported runtime', dirPath, 'removeDir');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'removeDir');
  }
};

/**
 * Synchronously removes a directory.
 *
 * @param path - The path to the directory
 * @param options - Options for removal
 * @param options.recursive - If true, removes directory and all its contents
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * removeDirSync('/path/to/empty-dir');
 * removeDirSync('/path/to/dir', { recursive: true }); // Remove with contents
 * ```
 */
export const removeDirSync: (
  path: string,
  options?: { recursive?: boolean },
) => void = (dirPath: string, options?: { recursive?: boolean }): void => {
  try {
    validatePath(dirPath, 'removeDirSync');
    const opts = { recursive: false, ...options };

    if (isDeno) {
      Deno.removeSync(dirPath, { recursive: opts.recursive });
    } else if (isBun || isNode) {
      if (opts.recursive) {
        nodeFs.rmSync(dirPath, { recursive: true, force: false });
      } else {
        nodeFs.rmdirSync(dirPath);
      }
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        dirPath,
        'removeDirSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'removeDirSync');
  }
};

/**
 * Creates a directory.
 *
 * @param path - The path to the directory to create
 * @param options - Options for directory creation
 * @param options.mode - File mode (permissions), e.g., 0o755
 * @param options.recursive - If true, creates parent directories as needed
 * @throws {FileAlreadyExists} If the directory already exists
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * await makeDir('/path/to/dir');
 * await makeDir('/path/to/nested/dir', { recursive: true });
 * await makeDir('/path/to/dir', { mode: 0o755 });
 * ```
 */
export const makeDir: (
  path: string,
  options?: { mode?: number; recursive?: boolean },
) => Promise<void> = async (
  dirPath: string,
  options?: { mode?: number; recursive?: boolean },
): Promise<void> => {
  try {
    validatePath(dirPath, 'makeDir');
    const opts = { recursive: false, ...options };

    if (isDeno) {
      await Deno.mkdir(dirPath, { recursive: opts.recursive, mode: opts.mode });
    } else if (isBun || isNode) {
      await nodeFs.promises.mkdir(dirPath, {
        recursive: opts.recursive,
        mode: opts.mode,
      });
    } else {
      throw new FileOperationError('Unsupported runtime', dirPath, 'makeDir');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'makeDir');
  }
};

/**
 * Synchronously creates a directory.
 *
 * @param path - The path to the directory to create
 * @param options - Options for directory creation
 * @param options.mode - File mode (permissions), e.g., 0o755
 * @param options.recursive - If true, creates parent directories as needed
 * @throws {FileAlreadyExists} If the directory already exists
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * makeDirSync('/path/to/dir');
 * makeDirSync('/path/to/nested/dir', { recursive: true });
 * ```
 */
export const makeDirSync: (
  path: string,
  options?: { mode?: number; recursive?: boolean },
) => void = (
  dirPath: string,
  options?: { mode?: number; recursive?: boolean },
): void => {
  try {
    validatePath(dirPath, 'makeDirSync');
    const opts = { recursive: false, ...options };

    if (isDeno) {
      Deno.mkdirSync(dirPath, { recursive: opts.recursive, mode: opts.mode });
    } else if (isBun || isNode) {
      nodeFs.mkdirSync(dirPath, { recursive: opts.recursive, mode: opts.mode });
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        dirPath,
        'makeDirSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'makeDirSync');
  }
};

/**
 * Ensures a directory exists, creating it (and parent directories) if needed.
 * Unlike makeDir, this does not throw an error if the directory already exists.
 *
 * @param path - The path to the directory to ensure exists
 * @param options - Options for directory creation
 * @param options.mode - File mode (permissions), e.g., 0o755
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path exists but is not a directory
 *
 * @example
 * ```ts
 * await ensureDir('/path/to/dir');
 * await ensureDir('/path/to/nested/dir', { mode: 0o755 });
 * ```
 */
export const ensureDir: (
  path: string,
  options?: { mode?: number },
) => Promise<void> = async (
  dirPath: string,
  options?: { mode?: number },
): Promise<void> => {
  try {
    validatePath(dirPath, 'ensureDir');

    try {
      await makeDir(dirPath, { ...options, recursive: true });
    } catch (error) {
      if (!(error instanceof FileAlreadyExists)) {
        throw error;
      }
      // Already exists - verify it's the right type
      if (!await isDirectory(dirPath)) {
        throw new FileTypeMismatch(dirPath, 'ensureDir', 'directory', 'file');
      }
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'ensureDir');
  }
};

/**
 * Synchronously ensures a directory exists, creating it (and parent directories) if needed.
 * Unlike makeDirSync, this does not throw an error if the directory already exists.
 *
 * @param path - The path to the directory to ensure exists
 * @param options - Options for directory creation
 * @param options.mode - File mode (permissions), e.g., 0o755
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path exists but is not a directory
 *
 * @example
 * ```ts
 * ensureDirSync('/path/to/dir');
 * ensureDirSync('/path/to/nested/dir', { mode: 0o755 });
 * ```
 */
export const ensureDirSync: (
  path: string,
  options?: { mode?: number },
) => void = (dirPath: string, options?: { mode?: number }): void => {
  try {
    validatePath(dirPath, 'ensureDirSync');

    try {
      makeDirSync(dirPath, { ...options, recursive: true });
    } catch (error) {
      if (!(error instanceof FileAlreadyExists)) {
        throw error;
      }
      // Already exists - verify it's the right type
      if (!isDirectorySync(dirPath)) {
        throw new FileTypeMismatch(dirPath, 'ensureDir', 'directory', 'file');
      }
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'ensureDirSync');
  }
};

/**
 * Recursively copies a directory and all its contents.
 *
 * @param src - The source directory path
 * @param dest - The destination directory path
 * @param options - Copy options
 * @param options.overwrite - If true, overwrites existing files (default: false)
 * @throws {FileNotFound} If the source directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If destination exists and overwrite is false
 *
 * @example
 * ```ts
 * await copyDir('/path/to/src', '/path/to/dest');
 * await copyDir('/path/to/src', '/path/to/dest', { overwrite: true });
 * ```
 */
export const copyDir: (
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
) => Promise<void> = async (
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
): Promise<void> => {
  try {
    validatePath(src, 'copyDir');
    validatePath(dest, 'copyDir');
    const opts = { overwrite: false, ...options };

    if (isDeno) {
      await copyDirDeno(src, dest, opts);
    } else if (isBun || isNode) {
      await copyDirNode(src, dest, opts);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'copyDir');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'copyDir');
  }
};

/** Helper for async directory copy in Deno */
async function copyDirDeno(
  src: string,
  dest: string,
  opts: { overwrite: boolean },
): Promise<void> {
  await ensureDir(dest);
  for await (const entry of Deno.readDir(src)) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory) {
      await copyDirDeno(srcPath, destPath, opts);
    } else {
      if (!opts.overwrite && await pathExists(destPath)) {
        throw new FileAlreadyExists(destPath, 'copyDir');
      }
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

/** Helper for async directory copy in Node/Bun */
async function copyDirNode(
  src: string,
  dest: string,
  opts: { overwrite: boolean },
): Promise<void> {
  await ensureDir(dest);
  const entries = await nodeFs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirNode(srcPath, destPath, opts);
    } else {
      if (!opts.overwrite && await pathExists(destPath)) {
        throw new FileAlreadyExists(destPath, 'copyDir');
      }
      await nodeFs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Synchronously recursively copies a directory and all its contents.
 *
 * @param src - The source directory path
 * @param dest - The destination directory path
 * @param options - Copy options
 * @param options.overwrite - If true, overwrites existing files (default: false)
 * @throws {FileNotFound} If the source directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If destination exists and overwrite is false
 *
 * @example
 * ```ts
 * copyDirSync('/path/to/src', '/path/to/dest');
 * copyDirSync('/path/to/src', '/path/to/dest', { overwrite: true });
 * ```
 */
export const copyDirSync: (
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
) => void = (
  src: string,
  dest: string,
  options?: { overwrite?: boolean },
): void => {
  try {
    validatePath(src, 'copyDirSync');
    validatePath(dest, 'copyDirSync');
    const opts = { overwrite: false, ...options };

    if (isDeno) {
      copyDirSyncDeno(src, dest, opts);
    } else if (isBun || isNode) {
      copyDirSyncNode(src, dest, opts);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'copyDirSync');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'copyDirSync');
  }
};

/** Helper for sync directory copy in Deno */
function copyDirSyncDeno(
  src: string,
  dest: string,
  opts: { overwrite: boolean },
): void {
  ensureDirSync(dest);
  for (const entry of Deno.readDirSync(src)) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory) {
      copyDirSyncDeno(srcPath, destPath, opts);
    } else {
      if (!opts.overwrite && pathExistsSync(destPath)) {
        throw new FileAlreadyExists(destPath, 'copyDirSync');
      }
      Deno.copyFileSync(srcPath, destPath);
    }
  }
}

/** Helper for sync directory copy in Node/Bun */
function copyDirSyncNode(
  src: string,
  dest: string,
  opts: { overwrite: boolean },
): void {
  ensureDirSync(dest);
  const entries = nodeFs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSyncNode(srcPath, destPath, opts);
    } else {
      if (!opts.overwrite && pathExistsSync(destPath)) {
        throw new FileAlreadyExists(destPath, 'copyDirSync');
      }
      nodeFs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Moves a directory from source to destination (rename across directories).
 *
 * @param src - The source directory path
 * @param dest - The destination directory path
 * @throws {FileNotFound} If the source directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * await moveDir('/path/to/src', '/another/path/dest');
 * ```
 */
export const moveDir: (src: string, dest: string) => Promise<void> = async (
  src: string,
  dest: string,
): Promise<void> => {
  try {
    validatePath(src, 'moveDir');
    validatePath(dest, 'moveDir');

    if (isDeno) {
      await Deno.rename(src, dest);
    } else if (isBun || isNode) {
      await nodeFs.promises.rename(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'moveDir');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'moveDir');
  }
};

/**
 * Synchronously moves a directory from source to destination (rename across directories).
 *
 * @param src - The source directory path
 * @param dest - The destination directory path
 * @throws {FileNotFound} If the source directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * moveDirSync('/path/to/src', '/another/path/dest');
 * ```
 */
export const moveDirSync: (src: string, dest: string) => void = (
  src: string,
  dest: string,
): void => {
  try {
    validatePath(src, 'moveDirSync');
    validatePath(dest, 'moveDirSync');

    if (isDeno) {
      Deno.renameSync(src, dest);
    } else if (isBun || isNode) {
      nodeFs.renameSync(src, dest);
    } else {
      throw new FileOperationError('Unsupported runtime', src, 'moveDirSync');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'moveDirSync');
  }
};

/**
 * Renames a directory in the same parent directory.
 *
 * @param dirPath - The path to the directory to rename
 * @param newName - The new name for the directory (not a full path, just the name)
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If a directory with the new name already exists
 *
 * @example
 * ```ts
 * await renameDir('/path/to/oldname', 'newname');
 * // Result: /path/to/newname
 * ```
 */
export const renameDir: (dirPath: string, newName: string) => Promise<void> =
  async (dirPath: string, newName: string): Promise<void> => {
    try {
      validatePath(dirPath, 'renameDir');
      validatePath(newName, 'renameDir');

      // Extract directory and construct new path using path compat layer
      const newPath = path.join(path.dirname(dirPath), newName);

      if (isDeno) {
        await Deno.rename(dirPath, newPath);
      } else if (isBun || isNode) {
        await nodeFs.promises.rename(dirPath, newPath);
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          dirPath,
          'renameDir',
        );
      }
    } catch (error) {
      if (error instanceof FileOperationError) {
        throw error;
      }
      throw wrapFileError(error, dirPath, 'renameDir');
    }
  };

/**
 * Synchronously renames a directory in the same parent directory.
 *
 * @param dirPath - The path to the directory to rename
 * @param newName - The new name for the directory (not a full path, just the name)
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If a directory with the new name already exists
 *
 * @example
 * ```ts
 * renameDirSync('/path/to/oldname', 'newname');
 * // Result: /path/to/newname
 * ```
 */
export const renameDirSync: (dirPath: string, newName: string) => void = (
  dirPath: string,
  newName: string,
): void => {
  try {
    validatePath(dirPath, 'renameDirSync');
    validatePath(newName, 'renameDirSync');

    // Extract directory and construct new path using path compat layer
    const newPath = path.join(path.dirname(dirPath), newName);

    if (isDeno) {
      Deno.renameSync(dirPath, newPath);
    } else if (isBun || isNode) {
      nodeFs.renameSync(dirPath, newPath);
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        dirPath,
        'renameDirSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'renameDirSync');
  }
};

/**
 * Empties a directory by removing all its contents while keeping the directory itself.
 *
 * @param dirPath - The path to the directory to empty
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is not a directory
 *
 * @example
 * ```ts
 * await emptyDir('/path/to/cache');
 * // Directory still exists but is now empty
 * ```
 */
export const emptyDir: (path: string) => Promise<void> = async (
  dirPath: string,
): Promise<void> => {
  try {
    validatePath(dirPath, 'emptyDir');

    // Verify it's a directory
    if (!await isDirectory(dirPath)) {
      throw new FileTypeMismatch(
        dirPath,
        'emptyDir',
        'directory',
        await isFile(dirPath) ? 'file' : 'unknown',
      );
    }

    // Read all entries and remove them
    for await (const entry of readDir(dirPath)) {
      await remove(entry.path);
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'emptyDir');
  }
};

/**
 * Synchronously empties a directory, removing all contents but keeping the directory itself.
 *
 * @param path - The path to the directory to empty
 * @throws {FileNotFound} If the directory doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileTypeMismatch} If the path is not a directory
 *
 * @example
 * ```ts
 * emptyDirSync('/path/to/dir');
 * // Directory still exists but all contents are removed
 * ```
 */
export const emptyDirSync: (path: string) => void = (dirPath: string): void => {
  try {
    validatePath(dirPath, 'emptyDirSync');

    // Verify it's a directory
    if (!isDirectorySync(dirPath)) {
      throw new FileTypeMismatch(dirPath, 'emptyDirSync', 'directory', 'file');
    }

    // Read all entries and remove them
    for (const entry of readDirSync(dirPath)) {
      removeSync(entry.path);
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, dirPath, 'emptyDirSync');
  }
};
//#endregion Directory operations

//#region Helpers
/**
 * Options for creating temporary files and directories.
 */
export type TempOptions = {
  /** Directory to create the temp file/dir in. Defaults to system temp directory. */
  dir?: string;
  /** Prefix for the temp file/dir name */
  prefix?: string;
  /** Suffix for the temp file/dir name */
  suffix?: string;
};

/**
 * Removes a file or directory at the specified path.
 * For directories, recursively removes all contents.
 *
 * @param path - The path to remove
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * await remove('/path/to/file-or-dir');
 * ```
 */
export const remove: (path: string) => Promise<void> = async (
  targetPath: string,
): Promise<void> => {
  try {
    validatePath(targetPath, 'remove');

    if (isDeno) {
      await Deno.remove(targetPath, { recursive: true });
    } else if (isBun || isNode) {
      const stats = await nodeFs.promises.stat(targetPath);
      if (stats.isDirectory()) {
        await nodeFs.promises.rm(targetPath, { recursive: true, force: false });
      } else {
        await nodeFs.promises.unlink(targetPath);
      }
    } else {
      throw new FileOperationError('Unsupported runtime', targetPath, 'remove');
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, targetPath, 'remove');
  }
};

/**
 * Synchronously removes a file or directory at the specified path.
 * For directories, recursively removes all contents.
 *
 * @param path - The path to remove
 * @throws {FileNotFound} If the path doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * removeSync('/path/to/file-or-dir');
 * ```
 */
export const removeSync: (path: string) => void = (
  targetPath: string,
): void => {
  try {
    validatePath(targetPath, 'removeSync');

    if (isDeno) {
      Deno.removeSync(targetPath, { recursive: true });
    } else if (isBun || isNode) {
      const stats = nodeFs.statSync(targetPath);
      if (stats.isDirectory()) {
        nodeFs.rmSync(targetPath, { recursive: true, force: false });
      } else {
        nodeFs.unlinkSync(targetPath);
      }
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        targetPath,
        'removeSync',
      );
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, targetPath, 'removeSync');
  }
};

/**
 * Moves a file or directory from source to destination with smart cross-device handling.
 * First attempts a fast rename operation. If that fails due to cross-device constraints,
 * falls back to copy+delete.
 *
 * @param src - The source path
 * @param dest - The destination path
 * @throws {FileNotFound} If the source doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * // Move within same device (fast rename)
 * await move('./old-file.txt', './new-file.txt');
 *
 * // Move across devices (copy + delete)
 * await move('/mnt/drive1/file.txt', '/mnt/drive2/file.txt');
 *
 * // Works for directories too
 * await move('./old-dir', './new-dir');
 * ```
 */
export const move: (src: string, dest: string) => Promise<void> = async (
  src: string,
  dest: string,
): Promise<void> => {
  try {
    validatePath(src, 'move');
    validatePath(dest, 'move');

    // Check if source exists and get its type
    const srcInfo = await stat(src);

    // Check if destination already exists
    if (await pathExists(dest)) {
      throw new FileAlreadyExists(dest, 'move');
    }

    // Try rename first (fast, works on same device)
    try {
      if (isDeno) {
        await Deno.rename(src, dest);
      } else if (isBun || isNode) {
        await nodeFs.promises.rename(src, dest);
      } else {
        throw new FileOperationError('Unsupported runtime', src, 'move');
      }
      return;
    } catch (error) {
      // Check if it's a cross-device error
      const err = error as { code?: string; name?: string };
      const isCrossDevice = err.code === 'EXDEV' ||
        err.name === 'CrossDevice' ||
        (err as Error).message?.includes('cross-device');

      if (!isCrossDevice) {
        // Not a cross-device error, rethrow
        throw error;
      }

      // Cross-device move: copy then delete
      if (srcInfo.isDirectory) {
        await copyDir(src, dest, { overwrite: false });
        await removeDir(src, { recursive: true });
      } else {
        await copyFile(src, dest);
        await deleteFile(src);
      }
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'move');
  }
};

/**
 * Synchronously moves a file or directory with smart cross-device handling.
 * First attempts a fast rename operation. If that fails due to cross-device constraints,
 * falls back to copy+delete.
 *
 * @param src - The source path
 * @param dest - The destination path
 * @throws {FileNotFound} If the source doesn't exist
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileAlreadyExists} If the destination already exists
 *
 * @example
 * ```ts
 * // Move within same device (fast rename)
 * moveSync('./old-file.txt', './new-file.txt');
 *
 * // Move across devices (copy + delete)
 * moveSync('/mnt/drive1/file.txt', '/mnt/drive2/file.txt');
 *
 * // Works for directories too
 * moveSync('./old-dir', './new-dir');
 * ```
 */
export const moveSync: (src: string, dest: string) => void = (
  src: string,
  dest: string,
): void => {
  try {
    validatePath(src, 'moveSync');
    validatePath(dest, 'moveSync');

    // Check if source exists and get its type
    const srcInfo = statSync(src);

    // Check if destination already exists
    if (pathExistsSync(dest)) {
      throw new FileAlreadyExists(dest, 'moveSync');
    }

    // Try rename first (fast, works on same device)
    try {
      if (isDeno) {
        Deno.renameSync(src, dest);
      } else if (isBun || isNode) {
        nodeFs.renameSync(src, dest);
      } else {
        throw new FileOperationError('Unsupported runtime', src, 'moveSync');
      }
      return;
    } catch (error) {
      // Check if it's a cross-device error
      const err = error as { code?: string; name?: string };
      const isCrossDevice = err.code === 'EXDEV' ||
        err.name === 'CrossDevice' ||
        (err as Error).message?.includes('cross-device');

      if (!isCrossDevice) {
        // Not a cross-device error, rethrow
        throw error;
      }

      // Cross-device move: copy then delete
      if (srcInfo.isDirectory) {
        copyDirSync(src, dest, { overwrite: false });
        removeDirSync(src, { recursive: true });
      } else {
        copyFileSync(src, dest);
        deleteFileSync(src);
      }
    }
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, src, 'moveSync');
  }
};

/**
 * Creates a temporary file and returns its path.
 *
 * @param options - Options for temp file creation
 * @returns Promise resolving to the path of the created temp file
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const tempFile = await makeTempFile();
 * const tempFile2 = await makeTempFile({ prefix: 'myapp-', suffix: '.txt' });
 * ```
 */
export const makeTempFile: (options?: TempOptions) => Promise<string> = async (
  options?: TempOptions,
): Promise<string> => {
  try {
    const opts = options ?? {};

    if (isDeno) {
      return await Deno.makeTempFile(opts);
    } else if (isBun || isNode) {
      const tmpdir = opts.dir ?? nodeOs.tmpdir();
      const prefix = opts.prefix ?? '';
      const suffix = opts.suffix ?? '';
      // Cryptographically-random name. Date.now()+Math.random() was
      // predictable (guessable temp paths for a local attacker); crypto
      // UUIDs are unguessable and collision-free even under rapid calls.
      const randomName = `${prefix}${crypto.randomUUID()}${suffix}`;
      const tempPath = path.join(tmpdir, randomName);

      await nodeFs.promises.writeFile(tempPath, '', { flag: 'wx' });
      return tempPath;
    }

    throw new FileOperationError('Unsupported runtime', '', 'makeTempFile');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, '', 'makeTempFile');
  }
};

/**
 * Synchronously creates a temporary file and returns its path.
 *
 * @param options - Options for temp file creation
 * @returns The path of the created temp file
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const tempFile = makeTempFileSync();
 * const tempFile2 = makeTempFileSync({ prefix: 'myapp-', suffix: '.txt' });
 * ```
 */
export const makeTempFileSync: (options?: TempOptions) => string = (
  options?: TempOptions,
): string => {
  try {
    const opts = options ?? {};

    if (isDeno) {
      return Deno.makeTempFileSync(opts);
    } else if (isBun || isNode) {
      const { tmpdir } = nodeOs;
      const tempdir = opts.dir ?? tmpdir();
      const prefix = opts.prefix ?? '';
      const suffix = opts.suffix ?? '';
      // Cryptographically-random name. Date.now()+Math.random() was
      // predictable (guessable temp paths for a local attacker); crypto
      // UUIDs are unguessable and collision-free even under rapid calls.
      const randomName = `${prefix}${crypto.randomUUID()}${suffix}`;
      const tempPath = path.join(tempdir, randomName);

      nodeFs.writeFileSync(tempPath, '', { flag: 'wx' });
      return tempPath;
    }

    throw new FileOperationError('Unsupported runtime', '', 'makeTempFileSync');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, '', 'makeTempFileSync');
  }
};

/**
 * Creates a temporary directory and returns its path.
 *
 * @param options - Options for temp directory creation
 * @returns Promise resolving to the path of the created temp directory
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const tempDir = await makeTempDir();
 * const tempDir2 = await makeTempDir({ prefix: 'myapp-' });
 * ```
 */
export const makeTempDir: (options?: TempOptions) => Promise<string> = async (
  options?: TempOptions,
): Promise<string> => {
  try {
    const opts = options ?? {};

    if (isDeno) {
      return await Deno.makeTempDir(opts);
    } else if (isBun || isNode) {
      const tmpdir = opts.dir ?? nodeOs.tmpdir();
      const prefix = opts.prefix ?? '';
      const suffix = opts.suffix ?? '';
      // Cryptographically-random name. Date.now()+Math.random() was
      // predictable (guessable temp paths for a local attacker); crypto
      // UUIDs are unguessable and collision-free even under rapid calls.
      const randomName = `${prefix}${crypto.randomUUID()}${suffix}`;
      const tempPath = path.join(tmpdir, randomName);

      await nodeFs.promises.mkdir(tempPath, { recursive: false });
      return tempPath;
    }

    throw new FileOperationError('Unsupported runtime', '', 'makeTempDir');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, '', 'makeTempDir');
  }
};

/**
 * Synchronously creates a temporary directory and returns its path.
 *
 * @param options - Options for temp directory creation
 * @returns The path of the created temp directory
 * @throws {FileAccessDenied} If permission is denied
 *
 * @example
 * ```ts
 * const tempDir = makeTempDirSync();
 * const tempDir2 = makeTempDirSync({ prefix: 'myapp-' });
 * ```
 */
export const makeTempDirSync: (options?: TempOptions) => string = (
  options?: TempOptions,
): string => {
  try {
    const opts = options ?? {};

    if (isDeno) {
      return Deno.makeTempDirSync(opts);
    } else if (isBun || isNode) {
      const { tmpdir } = nodeOs;
      const tempdir = opts.dir ?? tmpdir();
      const prefix = opts.prefix ?? '';
      const suffix = opts.suffix ?? '';
      // Cryptographically-random name. Date.now()+Math.random() was
      // predictable (guessable temp paths for a local attacker); crypto
      // UUIDs are unguessable and collision-free even under rapid calls.
      const randomName = `${prefix}${crypto.randomUUID()}${suffix}`;
      const tempPath = path.join(tempdir, randomName);

      nodeFs.mkdirSync(tempPath, { recursive: false });
      return tempPath;
    }

    throw new FileOperationError('Unsupported runtime', '', 'makeTempDirSync');
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, '', 'makeTempDirSync');
  }
};

/**
 * Converts a file URL to a file path.
 *
 * Converts a `file://` URL to a platform-specific file path. The URL must use the
 * `file:` protocol. The pathname is decoded and normalized to match the platform's
 * path separator conventions.
 *
 * @param url - The file URL to convert (string or URL object)
 * @returns The file path as a string
 * @throws {FileOperationError} If the URL doesn't use the file: protocol
 *
 * @example Basic conversion
 * ```ts
 * const path = fromFileUrl('file:///home/user/file.txt');
 * console.log(path); // '/home/user/file.txt' on Unix
 * ```
 *
 * @example With URL object
 * ```ts
 * const url = new URL('file:///C:/Users/user/file.txt');
 * const path = fromFileUrl(url);
 * console.log(path); // 'C:\\Users\\user\\file.txt' on Windows
 * ```
 *
 * @example With encoded characters
 * ```ts
 * const path = fromFileUrl('file:///path/to/file%20with%20spaces.txt');
 * console.log(path); // '/path/to/file with spaces.txt'
 * ```
 *
 * @example Error handling
 * ```ts
 * try {
 *   fromFileUrl('https://example.com/file.txt');
 * } catch (error) {
 *   console.error('Invalid protocol'); // Not a file: URL
 * }
 * ```
 */
export const fromFileUrl: (url: string | URL) => string = (
  url: string | URL,
): string => {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    if (urlObj.protocol !== 'file:') {
      throw new FileOperationError(
        'Invalid URL protocol, expected file:',
        String(url),
        'fromFileUrl',
      );
    }
    let pathname = decodeURIComponent(urlObj.pathname);

    // On Windows, pathname starts with / (e.g., /C:/...) - strip the leading /
    if (OS === 'WINDOWS' && /^\/[a-zA-Z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }

    return path.normalize(pathname);
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, '', 'fromFileUrl');
  }
};

/**
 * Converts a file path to a file URL.
 *
 * Converts a platform-specific file path to a `file://` URL. The path is first
 * resolved to an absolute path, then converted to a URL with proper encoding and
 * forward slashes regardless of the platform.
 *
 * @param filePath - The file path to convert
 * @returns A URL object with the file: protocol
 * @throws {FileOperationError} If the path is invalid or conversion fails
 *
 * @example Basic conversion
 * ```ts
 * const url = toFileUrl('/home/user/file.txt');
 * console.log(url.href); // 'file:///home/user/file.txt'
 * ```
 *
 * @example Windows path
 * ```ts
 * const url = toFileUrl('C:\\Users\\user\\file.txt');
 * console.log(url.href); // 'file:///C:/Users/user/file.txt'
 * ```
 *
 * @example Relative path (converts to absolute)
 * ```ts
 * const url = toFileUrl('./file.txt');
 * console.log(url.href); // 'file:///current/working/dir/file.txt'
 * ```
 *
 * @example With special characters
 * ```ts
 * const url = toFileUrl('/path/to/file with spaces.txt');
 * console.log(url.href); // 'file:///path/to/file%20with%20spaces.txt'
 * ```
 *
 * @example Round-trip conversion
 * ```ts
 * const originalPath = '/home/user/file.txt';
 * const url = toFileUrl(originalPath);
 * const convertedPath = fromFileUrl(url);
 * console.log(originalPath === convertedPath); // true
 * ```
 */
export const toFileUrl: (filePath: string) => URL = (
  filePath: string,
): URL => {
  try {
    validatePath(filePath, 'toFileUrl');
    const resolvedPath = path.resolve(filePath);
    const url = new URL(
      'file:///' + resolvedPath.split(path.SEPARATOR).join('/'),
    );
    return url;
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'toFileUrl');
  }
};

//#region File Handles

/**
 * Options for opening a file.
 *
 * @property {boolean} [read] - Open for reading
 * @property {boolean} [write] - Open for writing
 * @property {boolean} [append] - Open for appending
 * @property {boolean} [create] - Create file if it doesn't exist
 * @property {boolean} [truncate] - Truncate file to zero length
 * @property {number} [mode] - File mode (permissions) - Unix only
 */
export type OpenOptions = {
  read?: boolean;
  write?: boolean;
  append?: boolean;
  create?: boolean;
  truncate?: boolean;
  mode?: number;
};

/**
 * Async file handle for asynchronous file operations.
 *
 * Returned by {@link openFile}. Provides **only async methods** for writing data
 * and syncing to disk. All operations return Promises. Always close the handle
 * when done to avoid resource leaks.
 *
 * @example
 * ```ts
 * const file = await openFile('./log.txt', { write: true, create: true });
 * try {
 *   await file.write(new TextEncoder().encode('data\n'));
 *   await file.sync();
 * } finally {
 *   file.close();
 * }
 * ```
 */
export type AsyncFileHandle = {
  /** The file path */
  readonly path: string;
  /** Whether the file handle has been closed */
  readonly closed: boolean;
  /** Writes data to the file, returns bytes written */
  write(data: Uint8Array): Promise<number>;
  /** Flushes pending writes to disk */
  sync(): Promise<void>;
  /** Closes the file handle and releases resources */
  close(): void;
};

/**
 * Sync file handle for synchronous file operations.
 *
 * Returned by {@link openFileSync}. Provides **only sync methods** for writing data
 * and syncing to disk. All operations are blocking and return values directly.
 * Always close the handle when done to avoid resource leaks.
 *
 * @example
 * ```ts
 * const file = openFileSync('./log.txt', { write: true, create: true });
 * try {
 *   file.write(new TextEncoder().encode('data\n'));
 *   file.sync();
 * } finally {
 *   file.close();
 * }
 * ```
 */
export type SyncFileHandle = {
  /** The file path */
  readonly path: string;
  /** Whether the file handle has been closed */
  readonly closed: boolean;
  /** Writes data to the file, returns bytes written */
  write(data: Uint8Array): number;
  /** Flushes pending writes to disk */
  sync(): void;
  /** Closes the file handle and releases resources */
  close(): void;
};

/**
 * Internal cross-runtime file handle implementation.
 *
 * Provides a unified interface for buffered file I/O across Deno, Bun, and Node.js.
 * This class contains both async and sync methods internally, but only the appropriate
 * methods are exposed through {@link AsyncFileHandle} or {@link SyncFileHandle} type
 * wrappers to ensure type safety and prevent mixing async/sync operations.
 *
 * Useful for high-performance scenarios where you need fine-grained control over
 * file writes, such as logging or streaming data.
 *
 * @example Basic usage
 * ```ts
 * const file = await openFile('./log.txt', { write: true, create: true, append: true });
 * try {
 *   const data = new TextEncoder().encode('Log entry\n');
 *   await file.write(data);
 *   await file.sync(); // Ensure data is written to disk
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @internal
 */
class FileHandle {
  private readonly __path: string;
  private __handle: DenoFsFile | number | NodeFsHandle | null = null;
  private __closed = false;

  /**
   * Creates a FileHandle instance.
   * @internal Use {@link openFile} or {@link openFileSync} instead.
   */
  constructor(path: string, handle: DenoFsFile | number | NodeFsHandle) {
    this.__path = path;
    this.__handle = handle;
  }

  /**
   * Gets the file path associated with this handle.
   */
  get path(): string {
    return this.__path;
  }

  /**
   * Checks if the file handle has been closed.
   */
  get closed(): boolean {
    return this.__closed;
  }

  /**
   * Writes data to the file.
   *
   * @param data - The data to write
   * @returns Promise resolving to the number of bytes written
   * @throws {FileOperationError} If the handle is closed or write fails
   *
   * @example
   * ```ts
   * const encoder = new TextEncoder();
   * const bytesWritten = await file.write(encoder.encode('Hello'));
   * console.log(`Wrote ${bytesWritten} bytes`);
   * ```
   */
  async write(data: Uint8Array): Promise<number> {
    if (this.__closed || this.__handle === null) {
      throw new FileOperationError(
        'Cannot write to closed file handle',
        this.__path,
        'write',
      );
    }

    try {
      /* c8 ignore start */
      if (isDeno) {
        const bytesWritten = await (this.__handle as DenoFsFile).write(data);
        return bytesWritten ?? 0;
      } else if (isBun) {
        /* c8 ignore stop */
        return new Promise((resolve, reject) => {
          nodeFs.write(
            this.__handle as number,
            data,
            0,
            data.length,
            null,
            (err, bytesWritten) => {
              if (err) reject(err);
              else resolve(bytesWritten);
            },
          );
        });
      } else if (isNode) {
        // For Node.js async, use FileHandle object methods
        const result = await (this.__handle as NodeFsHandle).write(data);
        return result.bytesWritten;
        /* c8 ignore start */
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          this.__path,
          'write',
        );
      }
      /* c8 ignore stop */
    } catch (error) {
      throw wrapFileError(error, this.__path, 'write');
    }
  }

  /**
   * Synchronously writes data to the file.
   *
   * @param data - The data to write
   * @returns The number of bytes written
   * @throws {FileOperationError} If the handle is closed or write fails
   *
   * @example
   * ```ts
   * const encoder = new TextEncoder();
   * const bytesWritten = file.writeSync(encoder.encode('Hello'));
   * ```
   */
  writeSync(data: Uint8Array): number {
    if (this.__closed || this.__handle === null) {
      throw new FileOperationError(
        'Cannot write to closed file handle',
        this.__path,
        'writeSync',
      );
    }

    try {
      /* c8 ignore start */
      if (isDeno) {
        return (this.__handle as DenoFsFile).writeSync(data);
      } else if (isBun || isNode) {
        /* c8 ignore stop */
        return nodeFs.writeSync(this.__handle as number, data, 0, data.length);
        /* c8 ignore start */
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          this.__path,
          'writeSync',
        );
      }
      /* c8 ignore stop */
    } catch (error) {
      throw wrapFileError(error, this.__path, 'writeSync');
    }
  }

  /**
   * Flushes any pending writes to disk.
   *
   * Ensures that all buffered data is written to the underlying storage device.
   * Important for critical data like logs where you need to guarantee durability.
   *
   * @throws {FileOperationError} If the handle is closed or sync fails
   *
   * @example
   * ```ts
   * await file.write(data);
   * await file.sync(); // Ensure data is persisted to disk
   * ```
   */
  async sync(): Promise<void> {
    if (this.__closed || this.__handle === null) {
      throw new FileOperationError(
        'Cannot sync closed file handle',
        this.__path,
        'sync',
      );
    }

    try {
      /* c8 ignore start */
      if (isDeno) {
        await (this.__handle as DenoFsFile).sync();
      } else if (isBun) {
        /* c8 ignore stop */
        return new Promise((resolve, reject) => {
          nodeFs.fsync(this.__handle as number, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else if (isNode) {
        // For Node.js async, use FileHandle object methods
        await (this.__handle as NodeFsHandle).sync();
        /* c8 ignore start */
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          this.__path,
          'sync',
        );
      }
      /* c8 ignore stop */
    } catch (error) {
      throw wrapFileError(error, this.__path, 'sync');
    }
  }

  /**
   * Synchronously flushes any pending writes to disk.
   *
   * @throws {FileOperationError} If the handle is closed or sync fails
   *
   * @example
   * ```ts
   * file.writeSync(data);
   * file.syncSync(); // Ensure data is persisted to disk
   * ```
   */
  syncSync(): void {
    if (this.__closed || this.__handle === null) {
      throw new FileOperationError(
        'Cannot sync closed file handle',
        this.__path,
        'syncSync',
      );
    }

    try {
      /* c8 ignore start */
      if (isDeno) {
        (this.__handle as DenoFsFile).syncSync();
      } else if (isBun || isNode) {
        /* c8 ignore stop */
        nodeFs.fsyncSync(this.__handle as number);
        /* c8 ignore start */
      } else {
        throw new FileOperationError(
          'Unsupported runtime',
          this.__path,
          'syncSync',
        );
      }
      /* c8 ignore stop */
    } catch (error) {
      throw wrapFileError(error, this.__path, 'syncSync');
    }
  }

  /**
   * Closes the file handle and releases system resources.
   *
   * Once closed, the handle cannot be used for any operations.
   * This method is idempotent - calling it multiple times is safe.
   *
   * @example
   * ```ts
   * const file = await openFile('./data.txt', { read: true });
   * try {
   *   // ... operations
   * } finally {
   *   file.close(); // Always close in finally block
   * }
   * ```
   */
  close(): void {
    if (this.__closed || this.__handle === null) {
      return;
    }

    try {
      /* c8 ignore start */
      if (isDeno) {
        (this.__handle as DenoFsFile).close();
      } else if (isBun) {
        /* c8 ignore stop */
        nodeFs.closeSync(this.__handle as number);
      } else if (isNode) {
        // For Node.js async FileHandle, close it without waiting
        // This properly releases the handle and prevents finalizer issues
        (this.__handle as NodeFsHandle).close().catch(() => {});
        /* c8 ignore start */
      }
      /* c8 ignore stop */
    } catch {
      // Ignore errors on close - already closing
    } finally {
      this.__handle = null;
      this.__closed = true;
    }
  }
}

/**
 * Opens a file and returns an async file handle for low-level operations.
 *
 * Provides fine-grained control over file I/O with buffered writes and explicit
 * sync operations. Useful for high-performance scenarios like logging where you
 * need control over when data is flushed to disk.
 *
 * **Important:** Always close the file handle when done to avoid resource leaks.
 * Use try/finally blocks to ensure cleanup.
 *
 * **Type Safety:** Returns {@link AsyncFileHandle} which only exposes async methods
 * (`write`, `sync`). For synchronous operations, use {@link openFileSync}.
 *
 * **Runtime Implementation:**
 * - **Deno**: Uses `Deno.FsFile` with native async methods
 * - **Bun**: Uses numeric file descriptor with Node.js-style callbacks
 * - **Node.js**: Uses `FileHandle` object from `fs.promises.open()` to prevent
 *   garbage collection issues and properly manage file descriptors
 *
 * @param path - The path to the file
 * @param options - Options for opening the file (read, write, append, create, etc.)
 * @returns Promise resolving to an {@link AsyncFileHandle}
 * @throws {FileNotFound} If the file doesn't exist and create is false
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileInvalidPath} If the path is invalid or contains invalid characters
 *
 * @example Basic write with append
 * ```ts
 * const file = await openFile('./log.txt', { write: true, create: true, append: true });
 * try {
 *   const encoder = new TextEncoder();
 *   await file.write(encoder.encode('Log entry\n'));
 *   await file.sync(); // Ensure data is persisted to disk
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @example High-performance buffered logging
 * ```ts
 * const file = await openFile('./app.log', { write: true, create: true, append: true });
 * const buffer: Uint8Array[] = [];
 * let bufferSize = 0;
 * const MAX_BUFFER = 4096;
 *
 * async function log(message: string) {
 *   const data = new TextEncoder().encode(message + '\n');
 *   buffer.push(data);
 *   bufferSize += data.length;
 *
 *   if (bufferSize >= MAX_BUFFER) {
 *     await flush();
 *   }
 * }
 *
 * async function flush() {
 *   for (const data of buffer) {
 *     await file.write(data);
 *   }
 *   await file.sync(); // Critical for data durability
 *   buffer.length = 0;
 *   bufferSize = 0;
 * }
 * ```
 *
 * @example Create new file (truncate if exists)
 * ```ts
 * const file = await openFile('./output.txt', {
 *   write: true,
 *   create: true,
 *   truncate: true
 * });
 * try {
 *   await file.write(new TextEncoder().encode('Fresh content'));
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @see {@link openFileSync} for synchronous version
 * @see {@link AsyncFileHandle} for the return type
 * @see {@link OpenOptions} for all available options
 */
export const openFile: (
  path: string,
  options: OpenOptions,
) => Promise<AsyncFileHandle> = async (
  filePath: string,
  options: OpenOptions,
): Promise<AsyncFileHandle> => {
  try {
    validatePath(filePath, 'openFile');

    /* c8 ignore start */
    if (isDeno) {
      const file = await Deno.open(filePath, {
        read: options.read,
        write: options.write,
        append: options.append,
        create: options.create,
        truncate: options.truncate,
        mode: options.mode,
      });
      const handle = new FileHandle(filePath, file);
      return {
        path: handle.path,
        get closed() {
          return handle.closed;
        },
        write: (data: Uint8Array) => handle.write(data),
        sync: () => handle.sync(),
        close: () => handle.close(),
      };
    } else if (isBun || isNode) {
      /* c8 ignore stop */
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.open({read,write,append,create,truncate}) exactly. The old
      // string-flag mapping used 'w'/'w+' for create-without-truncate,
      // which truncates on Node/Bun but NOT on Deno (and 'a' always
      // created) — cross-runtime divergences. O_CREAT without O_TRUNC
      // opens-or-creates without truncating on every runtime.
      const C = nodeFs.constants;
      let flags = options.read && (options.write || options.append)
        ? C.O_RDWR
        : options.write || options.append
        ? C.O_WRONLY
        : C.O_RDONLY;
      if (options.append) flags |= C.O_APPEND;
      if (options.create) flags |= C.O_CREAT;
      if (options.truncate) flags |= C.O_TRUNC;

      const fd = await nodeFs.promises.open(filePath, flags, options.mode);
      // Bun: Extract numeric fd (uses callbacks in write/sync operations)
      // Node.js: Keep FileHandle object (has async methods and proper finalizer)
      // This prevents garbage collection issues in Node.js where extracting fd.fd
      // leaves the finalizer trying to close an already-closed descriptor
      const handle = new FileHandle(filePath, isBun ? fd.fd : fd);
      return {
        path: handle.path,
        get closed() {
          return handle.closed;
        },
        write: (data: Uint8Array) => handle.write(data),
        sync: () => handle.sync(),
        close: () => handle.close(),
      };
      /* c8 ignore start */
    } else {
      throw new FileOperationError('Unsupported runtime', filePath, 'openFile');
    }
    /* c8 ignore stop */
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'openFile');
  }
};

/**
 * Synchronously opens a file and returns a sync file handle for low-level operations.
 *
 * Provides fine-grained control over file I/O with synchronous writes and explicit
 * sync operations. Useful when you need blocking I/O behavior.
 *
 * **Important:** Always close the file handle when done to avoid resource leaks.
 * Use try/finally blocks to ensure cleanup.
 *
 * **Type Safety:** Returns {@link SyncFileHandle} which only exposes synchronous
 * methods (`write`, `sync`). For asynchronous operations, use {@link openFile}.
 *
 * **Runtime Implementation:**
 * - **Deno**: Uses `Deno.FsFile` with native sync methods
 * - **Bun**: Uses numeric file descriptor with Node.js-style sync operations
 * - **Node.js**: Uses numeric file descriptor from `fs.openSync()`
 *
 * @param path - The path to the file
 * @param options - Options for opening the file (read, write, append, create, etc.)
 * @returns A {@link SyncFileHandle}
 * @throws {FileNotFound} If the file doesn't exist and create is false
 * @throws {FileAccessDenied} If permission is denied
 * @throws {FileInvalidPath} If the path is invalid or contains invalid characters
 *
 * @example Basic synchronous write
 * ```ts
 * const file = openFileSync('./config.txt', { write: true, create: true });
 * try {
 *   const encoder = new TextEncoder();
 *   file.write(encoder.encode('config=value\n'));
 *   file.sync(); // Ensure data is persisted to disk
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @example Reading and writing
 * ```ts
 * // Note: Reading requires custom implementation with low-level handle
 * const file = openFileSync('./data.txt', {
 *   read: true,
 *   write: true,
 *   create: true
 * });
 * try {
 *   file.write(new TextEncoder().encode('Updated content'));
 *   file.sync();
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @example Append to existing file
 * ```ts
 * const file = openFileSync('./log.txt', {
 *   write: true,
 *   append: true,
 *   create: true
 * });
 * try {
 *   file.write(new TextEncoder().encode('New log entry\n'));
 * } finally {
 *   file.close();
 * }
 * ```
 *
 * @see {@link openFile} for asynchronous version
 * @see {@link SyncFileHandle} for the return type
 * @see {@link OpenOptions} for all available options
 */
export const openFileSync: (
  path: string,
  options: OpenOptions,
) => SyncFileHandle = (
  filePath: string,
  options: OpenOptions,
): SyncFileHandle => {
  try {
    validatePath(filePath, 'openFileSync');

    /* c8 ignore start */
    if (isDeno) {
      const file = Deno.openSync(filePath, {
        read: options.read,
        write: options.write,
        append: options.append,
        create: options.create,
        truncate: options.truncate,
        mode: options.mode,
      });
      const handle = new FileHandle(filePath, file);
      return {
        path: handle.path,
        get closed() {
          return handle.closed;
        },
        write: (data: Uint8Array) => handle.writeSync(data),
        sync: () => handle.syncSync(),
        close: () => handle.close(),
      };
    } else if (isBun || isNode) {
      /* c8 ignore stop */
      // Build POSIX open flags numerically so behaviour matches Deno's
      // Deno.open({read,write,append,create,truncate}) exactly. The old
      // string-flag mapping used 'w'/'w+' for create-without-truncate,
      // which truncates on Node/Bun but NOT on Deno (and 'a' always
      // created) — cross-runtime divergences. O_CREAT without O_TRUNC
      // opens-or-creates without truncating on every runtime.
      const C = nodeFs.constants;
      let flags = options.read && (options.write || options.append)
        ? C.O_RDWR
        : options.write || options.append
        ? C.O_WRONLY
        : C.O_RDONLY;
      if (options.append) flags |= C.O_APPEND;
      if (options.create) flags |= C.O_CREAT;
      if (options.truncate) flags |= C.O_TRUNC;

      const fd = nodeFs.openSync(filePath, flags, options.mode);
      const handle = new FileHandle(filePath, fd);
      return {
        path: handle.path,
        get closed() {
          return handle.closed;
        },
        write: (data: Uint8Array) => handle.writeSync(data),
        sync: () => handle.syncSync(),
        close: () => handle.close(),
      };
      /* c8 ignore start */
    } else {
      throw new FileOperationError(
        'Unsupported runtime',
        filePath,
        'openFileSync',
      );
    }
    /* c8 ignore stop */
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }
    throw wrapFileError(error, filePath, 'openFileSync');
  }
};

//#endregion File Handles

//#endregion Helpers
