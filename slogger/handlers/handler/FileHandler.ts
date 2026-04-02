import type { SlogObject } from '../../types/Object.ts';
import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import * as path from 'jsr:@std/path@^1.0.0';
import { ensureDirSync } from 'jsr:@std/fs@^1.0.0';
import { format } from 'jsr:@std/datetime@^0.225.4';
import { SyslogSeverities, variableReplacer } from '@tundralibs/utils';

/**
 * Configuration options for the File handler
 * @property storePath - Directory path where log files will be stored. Use variables like ${name}, ${date}, etc.
 * @property fileName - Base name for log files (can include date/time variables)
 * @property maxFileSize - Maximum size of log files in MB before rotation (default: 50MB)
 * @property bufferSize - Size of the buffer for batched writes in bytes (default: 4096)
 */
export type FileHandlerOptions = HandlerOptions & {
  storePath: string;
  fileName: string;
  maxFileSize?: number;
  bufferSize?: number;
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
  protected _storePath: string;
  protected _fileName: string;
  private readonly _maxFileSize: number;
  protected _bufferSize: number;

  protected _logFile: string;

  protected __fileHandle: Deno.FsFile | undefined = undefined;
  private __pointer: number = 0;
  private readonly __buffer: Uint8Array;

  private readonly __encoder: TextEncoder = new TextEncoder();

  /** Current file size in bytes - used for rotation checks */
  private __currentFileSize: number = 0;

  /**
   * Creates a new File handler instance
   *
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws Error if any of the required options are invalid
   */
  constructor(name: string, options: FileHandlerOptions) {
    super(name, options);
    const variables = {
      name: this.name,
      date: format(new Date(), 'YYYY-MM-dd'),
      day: format(new Date(), 'dd'),
      month: format(new Date(), 'MM'),
      year: format(new Date(), 'YYYY'),
      hour: format(new Date(), 'HH'),
    };
    // Validate store path
    if (!options.storePath || typeof options.storePath !== 'string') {
      throw new Error('FileHandler requires a valid storePath string');
    }
    this._storePath = options.storePath;

    // Validate file name
    if (!options.fileName || typeof options.fileName !== 'string') {
      throw new Error('FileHandler requires a valid fileName string');
    }
    this._fileName = options.fileName;

    // Validate max file size
    if (
      options.maxFileSize && (typeof options.maxFileSize !== 'number' ||
        options.maxFileSize <= 0)
    ) {
      throw new Error('FileHandler requires a positive maxFileSize');
    }
    this._maxFileSize = (options.maxFileSize || 50) * 1024 * 1024; // Default to 50MB

    // Set buffer size
    this._bufferSize = options.bufferSize ?? 4096;
    if (this._bufferSize <= 0) {
      throw new Error('FileHandler batchSize must be a positive number');
    }

    this.__buffer = new Uint8Array(this._bufferSize);

    this._logFile = variableReplacer(
      path.join(this._storePath, this._fileName),
      variables,
    );
  }

  /**
   * Initializes the file handler
   * Opens the log file for writing and creates it if it doesn't exist
   * Checks file size for potential rotation
   */
  public override async init(): Promise<void> {
    if (!this.__fileHandle) {
      // Ensure the directory exists before creating the file
      const variables = {
        name: this.name,
        date: format(new Date(), 'YYYY-MM-dd'),
        day: format(new Date(), 'dd'),
        month: format(new Date(), 'MM'),
        year: format(new Date(), 'YYYY'),
        hour: format(new Date(), 'HH'),
      };

      const expandedStorePath = variableReplacer(this._storePath, variables);
      try {
        ensureDirSync(expandedStorePath);
      } catch (e) {
        if (
          e instanceof Deno.errors.PermissionDenied ||
          e instanceof Deno.errors.NotCapable
        ) {
          throw new TypeError(
            `Permission denied to create log directory ${expandedStorePath}`,
          );
        }
        throw new Error(
          `Failed to create log directory ${expandedStorePath}: ${
            (e as Error).message
          }`,
        );
      }

      // Check if file exists and get its size for rotation tracking
      try {
        const fileInfo = await Deno.stat(this._logFile);
        this.__currentFileSize = fileInfo.size;

        // Rotate immediately if file is already over size limit
        if (this.__currentFileSize >= this._maxFileSize) {
          await this.__rotateLogFile();
        }
      } catch {
        // File doesn't exist yet, size starts at 0
        this.__currentFileSize = 0;
      }

      // Open or create the file for appending
      this.__fileHandle = await Deno.open(this._logFile, {
        append: true,
        write: true,
        create: true,
      });
      this.__resetBuffer();
    }
  }

  /**
   * Handle log entry by formatting it and writing to the file
   * For high severity logs (ERROR and above), immediately flush the buffer
   */
  public override async handle(log: SlogObject): Promise<void> {
    await super.handle(log);

    if (log.level <= SyslogSeverities.ERROR) {
      await this.__flushBuffer();
    }
  }

  /**
   * Clean up resources when handler is done
   * Flushes any remaining buffered data and closes the file
   */
  public override async finalize(): Promise<void> {
    if (this.__fileHandle) {
      await this.__flushBuffer();
      this.__fileHandle?.close();
      this.__fileHandle = undefined;
    }
    await super.finalize();
  }

  /**
   * Process a formatted log message by adding it to the write buffer
   * If buffer would overflow, flush it first
   *
   * @param message - The formatted log message
   */
  protected override async _handle(message: string): Promise<void> {
    if (!this.__fileHandle) {
      throw new Error('FileHandler not initialized - call init() first');
    }

    const encodedMessage = this.__encoder.encode(message + '\n');
    const messageLength = encodedMessage.length;

    // Check if single message is larger than buffer size
    if (messageLength > this._bufferSize) {
      // Flush current buffer first
      if (this.__pointer > 0) {
        await this.__flushBuffer();
      }
      // Write large message directly to file
      await this.__writeDirectToFile(encodedMessage);
      this.__currentFileSize += messageLength;
    } else {
      // Check if message fits in current buffer
      if (this.__pointer + messageLength > this._bufferSize) {
        await this.__flushBuffer();
      }

      // Add message to buffer at current pointer position
      this.__buffer.set(encodedMessage, this.__pointer);
      this.__pointer += messageLength;
      this.__currentFileSize += messageLength;
    }

    // Check if rotation is needed after this write
    if (this.__currentFileSize >= this._maxFileSize) {
      await this.__flushBuffer();
      await this.__rotateLogFile();
    }
  }

  /**
   * Writes buffered data to the file
   * Called when buffer is full, on high severity logs,
   * when rotation is needed, or when handler is finalized
   */
  private async __flushBuffer(): Promise<void> {
    if (this.__pointer > 0 && this.__fileHandle) {
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
    if (!this.__fileHandle) {
      throw new Error('File handle is not available');
    }

    let written = 0;
    while (written < data.length) {
      const bytesWritten = await this.__fileHandle.write(
        data.subarray(written),
      );
      if (bytesWritten === null || bytesWritten === 0) {
        throw new Error(
          'Failed to write to file - write returned null or zero bytes',
        );
      }
      written += bytesWritten;
    }

    // Ensure data is synced to disk for reliability
    await this.__fileHandle.sync();
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
   * New filename includes a timestamp to ensure uniqueness
   */
  private async __rotateLogFile(): Promise<void> {
    // Ensure buffer is flushed
    await this.__flushBuffer();

    // Close current file
    if (this.__fileHandle) {
      this.__fileHandle.close();
      this.__fileHandle = undefined;
    }

    // Create new filename with timestamp
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const dir = path.dirname(this._logFile);
    const base = path.basename(this._logFile);
    const rotatedFile = path.join(dir, `${base}_${timestamp}`);

    // Rename current file to include timestamp
    await Deno.rename(this._logFile, rotatedFile);

    // Reset file size counter
    this.__currentFileSize = 0;

    // Re-open file handle with the original name (will create a new file)
    this.__fileHandle = await Deno.open(this._logFile, {
      append: true,
      write: true,
      create: true,
    });
  }
}
