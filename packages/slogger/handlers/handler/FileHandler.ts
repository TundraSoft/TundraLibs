import type { SlogObject } from '../../types/SlogObject.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import * as path from '@tundralibs/compat/path';
import {
  type AsyncFileHandle,
  ensureDirSync,
  moveFile,
  openFile,
  stat,
} from '@tundralibs/compat';
import { format } from '@std/datetime';
import { SyslogSeverities, variableReplacer } from '@tundralibs/utils';
import { SloggerConfigError, SloggerHandlerError } from '../../errors/mod.ts';

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
 */
export class FileHandler extends AbstractHandler {
  public readonly mode = 'file';
  protected _directory: string;
  protected _filenameTemplate: string;
  private readonly __maxFileSizeBytes: number;
  protected _bufferSizeBytes: number;

  protected _logFile: string;

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
  protected _openLogFile(): Promise<AsyncFileHandle> {
    return openFile(this._logFile, {
      append: true,
      write: true,
      create: true,
    });
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
