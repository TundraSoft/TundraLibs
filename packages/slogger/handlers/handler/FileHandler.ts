import type { SlogObject } from '../../types/SlogObject.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import * as path from '@tundralibs/compat/path';
import {
  type AsyncFileHandle,
  ensureDirSync,
  moveFile,
  openFile,
  stat,
} from '@tundralibs/compat/file';
import { format } from '@std/datetime';
import { SyslogSeverities, variableReplacer } from '@tundralibs/utils';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';

/**
 * The two `statfs` fields the ephemeral-filesystem probe consults —
 * block size and total block count. Declared loosely (both optional)
 * because `node:fs`'s `StatsFs` is not a shared type across Deno, Bun
 * and Node, and Bun's struct omits fields the other two carry.
 */
type FilesystemCapacity = { bsize?: number; blocks?: number };

/** `node:fs`'s `statfsSync`, narrowed to the fields the probe reads. */
type StatfsSync = (path: string) => FilesystemCapacity;

/**
 * The slice of the global object this module reads:
 * `process.getBuiltinModule`, the synchronous accessor for a runtime's
 * built-in modules. Every member is optional because none of them exist
 * in a browser, which is the entire point of going through it.
 */
type BuiltinModuleHost = {
  process?: {
    getBuiltinModule?: (
      id: 'node:fs',
    ) => { statfsSync?: StatfsSync } | undefined;
  };
};

/**
 * The slice of the global object used to ask Deno whether `statfs` is
 * allowed. Typed here rather than against `Deno.permissions` so the
 * module stays free of runtime-specific globals, and optional
 * throughout because no other runtime has any of it.
 */
type PermissionHost = {
  Deno?: {
    permissions?: {
      querySync?: (
        descriptor: { name: 'sys'; kind: string },
      ) => { state: string };
    };
  };
};

/**
 * The runtime's `statfsSync`, or `undefined` where the runtime exposes
 * no `node:fs` (browsers). Present on Deno 2, Node >= 18.15, Bun and
 * workerd under `nodejs_compat`.
 *
 * Resolved through `process.getBuiltinModule` rather than a static
 * `import { statfsSync } from 'node:fs'` so that merely *importing*
 * this module never fails: a static specifier is resolved at module-eval
 * time and is fatal in a browser bundle, whereas this lookup is a plain
 * optional-chained property read that yields `undefined` there. A
 * top-level `await import()` is equally unusable — one anywhere in the
 * graph makes esbuild/Rollup lower every module initializer to an async
 * function and deadlocks legal circular imports.
 */
const STATFS_SYNC: StatfsSync | undefined = (globalThis as BuiltinModuleHost)
  .process?.getBuiltinModule?.('node:fs')?.statfsSync;

/**
 * The runtime's `statfs`, but only when calling it is free of
 * side effects. Deno gates `statfs` behind `--allow-sys=statfs` and
 * **prompts** for it on a TTY (`Deno requests sys access to "statfs"`)
 * — a logger opening its own log file must never pop a permission
 * prompt, so an ungranted permission counts as "no probe available"
 * and the check is skipped. `querySync` needs no permission of its own
 * and never prompts; Bun, Node and workerd have no such gate and so
 * have no `Deno.permissions` to consult.
 *
 * @returns The probe to use, or `undefined` when there is none to use.
 */
function defaultStatfs(): StatfsSync | undefined {
  const state = (globalThis as PermissionHost).Deno?.permissions?.querySync?.({
    name: 'sys',
    kind: 'statfs',
  })?.state;
  return (state === undefined || state === 'granted') ? STATFS_SYNC : undefined;
}

/**
 * Whether `filePath` sits on a filesystem that claims no capacity at
 * all — `statfs` reporting `blocks === 0 && bsize === 0`. No real
 * filesystem describes itself that way; workerd's in-memory one does,
 * and writes to it are discarded by the end of the request that made
 * them — gone before the next request even starts, not just eventually
 * at isolate recycle. The check
 * is a property claim rather than a runtime brand, so it stays true for
 * any future ephemeral runtime.
 *
 * Returns `false` whenever the answer is not a definite yes: when the
 * runtime provides no usable `statfs` (a missing probe must never
 * produce a warning — see {@link defaultStatfs}) and when the call
 * throws (path gone, read permission denied). It deliberately does NOT
 * fall back to `dev`/`ino` being `0` — some Windows runtimes report
 * zero or synthetic values there for perfectly good files, and warning
 * about a healthy log file costs more than a missed warning.
 *
 * Exported (but not re-exported from the package root, so not public
 * API) only so the otherwise runtime-specific branch is unit-testable
 * via the `statfs` seam.
 *
 * @internal
 * @param filePath - Path to probe. Must exist: a real filesystem throws
 *   `ENOENT` for a missing path, which reads as "not ephemeral".
 * @param statfs - `statfs` implementation to probe with; defaults to
 *   {@link defaultStatfs}. Pass `null` to stand in for a runtime that
 *   has none — an explicit `undefined` takes the default, as always.
 * @returns `true` only when the filesystem reports zero capacity.
 */
export function isEphemeralFilesystem(
  filePath: string,
  statfs: StatfsSync | null | undefined = defaultStatfs(),
): boolean {
  if (typeof statfs !== 'function') {
    return false;
  }
  try {
    const capacity = statfs(filePath);
    return capacity.blocks === 0 && capacity.bsize === 0;
  } catch {
    return false;
  }
}

/**
 * Configuration options for the File handler.
 *
 * @property directory - Directory where log files are written. Path
 *   may contain `${name}`, `${date}`, `${day}`, `${month}`, `${year}`,
 *   `${hour}` placeholders (substituted at init time).
 * @property filenameTemplate - Filename within the directory. Same
 *   placeholder set as `directory`.
 * @property maxFileSizeBytes - Rotate the file once it reaches this
 *   size **in bytes**. Default `52_428_800` (50 MiB).
 * @property bufferSizeBytes - Write-buffer size **in bytes**. Default
 *   `4096`. Both size fields are now in the same unit.
 */
export type FileHandlerOptions = HandlerOptions & {
  directory: string;
  filenameTemplate: string;
  maxFileSizeBytes?: number;
  bufferSizeBytes?: number;
};

/**
 * File Handler for writing log messages to disk
 *
 * This handler writes log messages to files with automatic rotation
 * when files reach a specified size limit. It uses buffered writes
 * for better performance.
 *
 * A successful write does not imply the record was persisted: on
 * Cloudflare Workers only `/tmp` is writable and it is an in-memory
 * filesystem, so writes succeed and even read back, then vanish by the
 * next request — not merely whenever the isolate eventually recycles;
 * workerd's own guarantee on `/tmp` is per-request. The handler probes
 * for that at open and reports it once per instance via `console.error`;
 * reach for {@link MemoryHandler} when in-process buffering is what you
 * want.
 */
export class FileHandler extends AbstractHandler {
  /** Runtime discriminator for this handler kind. */
  public readonly mode = 'file';

  /**
   * Directory as configured, placeholders unexpanded — `init()` expands
   * them fresh on every call so a `${date}` path rolls over.
   */
  protected _directory: string;

  /** Filename as configured, placeholders unexpanded. */
  protected _filenameTemplate: string;

  private readonly __maxFileSizeBytes: number;

  /**
   * Write-buffer size. A single record larger than this skips the buffer
   * and goes straight to the file.
   */
  protected _bufferSizeBytes: number;

  /**
   * Resolved path of the active log file — `_directory` joined with
   * `_filenameTemplate`, placeholders substituted at construction.
   * Rotation renames this path away and reopens it, so the value itself
   * never changes.
   */
  protected _logFile: string;

  /**
   * Open handle on {@link _logFile}. `undefined` before `init()`, while
   * rotating, and after `finalize()`.
   */
  protected _fileHandle: AsyncFileHandle | undefined = undefined;
  private __pointer: number = 0;
  private readonly __buffer: Uint8Array;

  /**
   * Serialises every write/rotation against the shared buffer. Each
   * task is appended to this promise chain so the buffer pointer,
   * file-size counter and rotation can never interleave between
   * concurrent fire-and-forget `handle()` calls. See `__enqueue`.
   */
  private __writeChain: Promise<void> = Promise.resolve();

  private readonly __encoder: TextEncoder = new TextEncoder();

  /** Current file size in bytes - used for rotation checks */
  private __currentFileSize: number = 0;

  /**
   * Whether the ephemeral-filesystem probe has already run for this
   * handler. The filesystem behind {@link _logFile} cannot change under
   * a live handler, so the probe runs on the first open only — which is
   * also what keeps the warning to one per handler instance rather than
   * one per rotation. Per instance, not per process: two handlers may
   * target different filesystems.
   */
  private __ephemeralChecked: boolean = false;

  /** 50 MiB. Used as the default when `maxFileSizeBytes` is omitted. */
  private static readonly DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

  /**
   * Creates a new File handler instance
   *
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `directory` or
   *   `filenameTemplate` is missing/invalid, or when
   *   `maxFileSizeBytes` / `bufferSizeBytes` is not a positive number.
   */
  constructor(name: string, options: FileHandlerOptions) {
    super(name, options);
    const variables = {
      name: this.name,
      date: format(new Date(), 'yyyy-MM-dd'),
      day: format(new Date(), 'dd'),
      month: format(new Date(), 'MM'),
      year: format(new Date(), 'yyyy'),
      hour: format(new Date(), 'HH'),
    };
    // Validate directory
    if (!options.directory || typeof options.directory !== 'string') {
      throw new SloggerConfigError(
        'FileHandler requires a valid directory string',
        { key: 'directory' },
      );
    }
    this._directory = options.directory;

    // Validate filename template
    if (
      !options.filenameTemplate || typeof options.filenameTemplate !== 'string'
    ) {
      throw new SloggerConfigError(
        'FileHandler requires a valid filenameTemplate string',
        { key: 'filenameTemplate' },
      );
    }
    this._filenameTemplate = options.filenameTemplate;

    // Validate max file size (bytes)
    if (
      options.maxFileSizeBytes !== undefined &&
      (typeof options.maxFileSizeBytes !== 'number' ||
        options.maxFileSizeBytes <= 0)
    ) {
      throw new SloggerConfigError(
        'FileHandler requires a positive maxFileSizeBytes',
        { key: 'maxFileSizeBytes', value: options.maxFileSizeBytes },
      );
    }
    this.__maxFileSizeBytes = options.maxFileSizeBytes ??
      FileHandler.DEFAULT_MAX_FILE_SIZE_BYTES;

    // Set buffer size (bytes)
    this._bufferSizeBytes = options.bufferSizeBytes ?? 4096;
    if (this._bufferSizeBytes <= 0) {
      throw new SloggerConfigError(
        'FileHandler bufferSizeBytes must be a positive number',
        { key: 'bufferSizeBytes', value: options.bufferSizeBytes },
      );
    }

    this.__buffer = new Uint8Array(this._bufferSizeBytes);

    this._logFile = variableReplacer(
      path.join(this._directory, this._filenameTemplate),
      variables,
    );
  }

  /**
   * Initializes the file handler
   * Opens the log file for writing and creates it if it doesn't exist
   * Checks file size for potential rotation
   */
  public override async init(): Promise<void> {
    if (!this._fileHandle) {
      // Ensure the directory exists before creating the file
      const variables = {
        name: this.name,
        date: format(new Date(), 'yyyy-MM-dd'),
        day: format(new Date(), 'dd'),
        month: format(new Date(), 'MM'),
        year: format(new Date(), 'yyyy'),
        hour: format(new Date(), 'HH'),
      };

      const expandedDirectory = variableReplacer(this._directory, variables);
      // ensureDirSync from compat layer already handles errors properly
      ensureDirSync(expandedDirectory);

      // Check if file exists and get its size for rotation tracking
      try {
        const fileInfo = await stat(this._logFile);
        this.__currentFileSize = fileInfo.size;

        // Rotate immediately if file is already over size limit
        if (this.__currentFileSize >= this.__maxFileSizeBytes) {
          await this.__rotateLogFile();
        }
      } catch {
        // File doesn't exist yet, size starts at 0
        this.__currentFileSize = 0;
      }

      // Open or create the file for appending. When the pre-existing
      // file was already over the size cap, `__rotateLogFile()` above
      // has ALREADY opened a fresh handle — opening again here would
      // orphan that descriptor (fd leak) and leave two handles on the
      // same file. Only open when rotation didn't.
      if (!this._fileHandle) {
        this._fileHandle = await this._openLogFile();
      }
      this.__resetBuffer();
    }
  }

  /**
   * Open (creating if absent) the active log file for appending. The
   * single funnel for acquiring a file handle — both `init()` and
   * {@link __rotateLogFile} go through here so there is exactly one
   * open site and the caller stays responsible for closing/replacing
   * `_fileHandle`.
   *
   * @returns The opened file handle.
   */
  protected async _openLogFile(): Promise<AsyncFileHandle> {
    const handle = await openFile(this._logFile, {
      append: true,
      write: true,
      create: true,
    });
    // Probe AFTER the open: `statfs` needs an existing path, and this
    // is the first moment the log file is guaranteed to be there.
    this.__warnIfEphemeral();
    return handle;
  }

  /**
   * Whether {@link _logFile} sits on a filesystem that cannot persist
   * anything. Delegates to {@link isEphemeralFilesystem}; separated as
   * an overridable seam so the warning can be exercised without an
   * ephemeral filesystem to hand.
   *
   * @internal
   * @returns `true` when writes to the log file will not survive the
   *   process.
   */
  protected _isEphemeralFilesystem(): boolean {
    return isEphemeralFilesystem(this._logFile);
  }

  /**
   * Report — once — that the log file is on a filesystem that discards
   * everything written to it. A warning rather than a throw: `/tmp` on
   * Workers may well be a deliberate scratch choice, and breaking a
   * deliberate choice is worse than naming it.
   */
  private __warnIfEphemeral(): void {
    if (this.__ephemeralChecked) {
      return;
    }
    this.__ephemeralChecked = true;
    if (!this._isEphemeralFilesystem()) {
      return;
    }
    console.error(
      `[slogger] FileHandler '${this.name}': the filesystem holding ` +
        `'${this._logFile}' reports zero capacity, so it persists nothing. ` +
        `Writes will succeed, but every record is gone by the very next ` +
        `request (a Cloudflare Workers '/tmp' path behaves this way — ` +
        `not just eventually, on isolate recycle). Use MemoryHandler if ` +
        `in-process buffering is what you want, or point 'directory' at ` +
        `a real filesystem.`,
    );
  }

  /**
   * Handle log entry by formatting it and writing to the file
   * For high severity logs (ERROR and above), immediately flush the buffer
   */
  public override async handle(log: SlogObject): Promise<void> {
    // Wait for the file to be open before formatting/writing. On the
    // declarative path `LogManager.createHandler` starts init() but does
    // not await it, so a record logged immediately after construction
    // would otherwise reach `__doHandle` with no file handle, throw, and
    // be silently dropped by Slogger.log()'s swallowing `.catch`. Only
    // gates when init was actually started (see `_awaitInitIfStarted`),
    // so a directly-constructed handler used before `init()` keeps its
    // historical "rejects when uninitialized" behaviour.
    await this._awaitInitIfStarted();
    await super.handle(log);

    if (log.level <= SyslogSeverities.ERROR) {
      // Serialised flush — see `__enqueue`. Without this, an
      // ERROR-level flush could race a buffered write still queued on
      // the chain.
      await this.__enqueue(() => this.__flushBuffer());
    }
  }

  /**
   * Clean up resources when handler is done
   * Flushes any remaining buffered data and closes the file
   */
  public override async finalize(): Promise<void> {
    // Surface a failed initialization (bad directory, permission
    // denied) here instead of leaving it a swallowed rejection: since
    // `LogManager.createHandler` no longer awaits init(), an explicit
    // `await logger.finalize()` is where a mis-configured FileHandler
    // becomes observable (wrapped in a SloggerFinalizeError). Awaits the
    // init only when it was actually started (the declarative path), so
    // a directly-constructed, never-initialized handler isn't forced to
    // open a file just to be finalized; a no-op once init succeeded.
    await this._awaitInitIfStarted();
    // Drain the write chain first so any in-flight buffered writes
    // land before we flush and close. Closing while a queued write is
    // mid-flight would lose data or hit a released handle.
    await this.__enqueue(async () => {
      if (this._fileHandle) {
        await this.__flushBuffer();
        this._fileHandle.close();
        this._fileHandle = undefined;
      }
    });
    await super.finalize();
  }

  /**
   * Process a formatted log message by adding it to the write buffer
   * If buffer would overflow, flush it first
   *
   * @param message - The formatted log message
   */
  protected override _handle(message: string): Promise<void> {
    // The encode happens up front (cheap, no shared state) but the
    // buffer mutation + file write must be serialised: `handle()` is
    // dispatched fire-and-forget from Slogger.log(), so without a
    // queue two concurrent `_handle` calls would interleave on the
    // shared `__buffer` / `__pointer` / `__currentFileSize` and corrupt
    // bytes or miscount the rotation size. See `__enqueue`.
    return this.__enqueue(() => this.__doHandle(message));
  }

  /**
   * Buffer-and-write critical section for a single message. Runs only
   * while it holds the write chain, so all access to `__buffer`,
   * `__pointer` and `__currentFileSize` is exclusive.
   *
   * @param message - The formatted log message
   * @throws Error if the handler has not been initialised
   */
  private async __doHandle(message: string): Promise<void> {
    if (!this._fileHandle) {
      throw new SloggerHandlerError(
        'FileHandler not initialized - call init() first',
        { handler: this.name, file: this._logFile },
      );
    }

    const encodedMessage = this.__encoder.encode(message + '\n');
    const messageLength = encodedMessage.length;

    // Check if single message is larger than buffer size
    if (messageLength > this._bufferSizeBytes) {
      // Flush current buffer first
      if (this.__pointer > 0) {
        await this.__flushBuffer();
      }
      // Write large message directly to file
      await this.__writeDirectToFile(encodedMessage);
      this.__currentFileSize += messageLength;
    } else {
      // Check if message fits in current buffer
      if (this.__pointer + messageLength > this._bufferSizeBytes) {
        await this.__flushBuffer();
      }

      // Add message to buffer at current pointer position
      this.__buffer.set(encodedMessage, this.__pointer);
      this.__pointer += messageLength;
      this.__currentFileSize += messageLength;
    }

    // Check if rotation is needed after this write
    if (this.__currentFileSize >= this.__maxFileSizeBytes) {
      await this.__flushBuffer();
      await this.__rotateLogFile();
    }
  }

  /**
   * Append `task` to the serial write chain and return a promise that
   * settles when `task` has run. Tasks execute strictly one-at-a-time
   * in enqueue order; a rejected task does not break the chain for
   * subsequent tasks (the chain advances regardless), but its own
   * rejection is surfaced to the caller that enqueued it.
   *
   * @param task - The critical section to run with exclusive access to
   *   the buffer / file handle.
   */
  private __enqueue(task: () => Promise<void>): Promise<void> {
    // Advance the chain on settle (success OR failure) so one failed
    // write can't wedge every later write behind a rejected promise.
    const run = this.__writeChain.then(task, task);
    this.__writeChain = run.then(() => {}, () => {});
    return run;
  }

  /**
   * Writes buffered data to the file
   * Called when buffer is full, on high severity logs,
   * when rotation is needed, or when handler is finalized
   */
  private async __flushBuffer(): Promise<void> {
    if (this.__pointer > 0 && this._fileHandle) {
      const dataToWrite = this.__buffer.subarray(0, this.__pointer);
      await this.__writeDirectToFile(dataToWrite);
      this.__resetBuffer();
    }
  }

  /**
   * Writes data directly to the file handle
   * @param data - The data to write to the file
   */
  private async __writeDirectToFile(data: Uint8Array): Promise<void> {
    if (!this._fileHandle) {
      throw new SloggerHandlerError('File handle is not available', {
        handler: this.name,
        file: this._logFile,
      });
    }

    let written = 0;
    while (written < data.length) {
      const bytesWritten = await this._fileHandle.write(
        data.subarray(written),
      );
      if (bytesWritten === 0) {
        throw new SloggerHandlerError(
          'Failed to write to file - write returned zero bytes',
          { handler: this.name, file: this._logFile },
        );
      }
      written += bytesWritten;
    }

    // NOTE: We deliberately do NOT call fileHandle.sync() per write.
    // fsync(2) is the slowest filesystem operation and defeats the
    // purpose of the in-memory buffer above. Buffered writes hit the
    // page cache fast; the OS flushes to disk on its own schedule.
    // We sync only on `finalize()` (clean shutdown) and on rotation.
    // If you need stronger durability between crashes, consider
    // adding a configurable `syncIntervalMs` and a periodic flush.
  }

  /**
   * Resets the buffer pointer to start of buffer
   * Called after flushing or when initializing
   */
  private __resetBuffer(): void {
    this.__pointer = 0;
  }

  /**
   * Rotates the log file by closing current file and creating a new one
   * New filename includes a timestamp plus, on collision, a numeric
   * suffix to ensure uniqueness.
   */
  private async __rotateLogFile(): Promise<void> {
    // Ensure buffer is flushed
    await this.__flushBuffer();

    // Close current file
    if (this._fileHandle) {
      this._fileHandle.close();
      this._fileHandle = undefined;
    }

    // Create new filename with timestamp. The timestamp has only
    // one-second resolution, so two rotations within the same wall-clock
    // second (small `maxFileSizeBytes` + burst logging, or an init-time
    // rotation colliding with a write-triggered one) would produce the
    // same name — and `moveFile` is a plain rename that silently
    // overwrites, destroying the earlier rotated file. Probe for a free
    // name and append an incrementing suffix on collision. Rotations are
    // serialised on the write chain, so this check-then-rename cannot
    // race another rotation within this handler.
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const dir = path.dirname(this._logFile);
    const base = path.basename(this._logFile);
    let rotatedFile = path.join(dir, `${base}_${timestamp}`);
    let suffix = 1;
    while (await this.__fileExists(rotatedFile)) {
      rotatedFile = path.join(dir, `${base}_${timestamp}.${suffix}`);
      suffix++;
    }

    // Rename current file to include timestamp
    await moveFile(this._logFile, rotatedFile);

    // Reset file size counter
    this.__currentFileSize = 0;

    // Re-open file handle with the original name (will create a new file)
    this._fileHandle = await this._openLogFile();
  }

  /**
   * Whether `filePath` currently exists on disk. Used by
   * {@link __rotateLogFile} to avoid overwriting a rotated file that
   * shares the same one-second timestamp.
   *
   * @param filePath - Path to probe.
   * @returns `true` when the path exists, `false` otherwise.
   */
  private async __fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
