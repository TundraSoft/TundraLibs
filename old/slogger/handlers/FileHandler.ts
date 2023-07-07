import { BaseHandler } from '../BaseHandler.ts';
import { FileHandlerOptions } from '../types.ts';

import { Syslog } from '../../syslog/mod.ts';
import { BufWriterSync, dateFormat, fs, path } from '../../dependencies.ts';

export class FileHandler extends BaseHandler<FileHandlerOptions> {
  protected _file: Deno.FsFile | undefined;
  protected _buf!: BufWriterSync;
  protected _encoder = new TextEncoder();
  protected _counter = 0; // Log Rotation

  constructor(options: Partial<FileHandlerOptions>) {
    const defaults: Partial<FileHandlerOptions> = {
      path: './logs',
      fileName: '{appName}-{date}.log',
      rotate: 5 * 1024 * 1024, // 5 MB
    };
    super(options, defaults);
  }

  protected _handleLog(log: Syslog) {
    const msg = this._encoder.encode(this._format(log) + '\n');
    if (msg.byteLength > this._buf.available()) {
      this._flush();
    }
    this._buf.writeSync(msg);
  }

  override async init(): Promise<void> {
    await super.init();
    const fileName = this._getFileName(),
      openOptions = {
        append: true,
        write: true,
      };
    // Ensure directory is present
    await fs.ensureFile(fileName);
    this._file = await Deno.open(fileName, openOptions);
    this._buf = new BufWriterSync(this._file);
  }

  override async cleanup() {
    await super.cleanup();
    // Flush
    await this._flush();
    await this._file?.close();
    this._file = undefined;
  }

  protected _getFileName(): string {
    // Get the file name
    const variables: { [key: string]: string } = {
        appName: this._options.appName,
        hostname: this._options.hostName || '',
        date: dateFormat(new Date(), 'yyyy-MM-dd'),
      },
      basePath = this._options.path;
    let fileName = path.join(basePath, this._options.fileName);
    for (const [name, value] of Object.entries(variables)) {
      const reg = new RegExp(`{${name}}`, 'gi');
      fileName = fileName.replaceAll(reg, value);
    }
    if (this._options.rotate && this._options.rotate > 1) {
      this._counter = 0;
      const filePath = path.parse(fileName);
      filePath.name = filePath.name + this._counter.toString();
      fileName = path.format(filePath);
    }
    return fileName;
  }

  protected async _flush() {
    if (this._buf && this._buf.buffered() > 0) {
      await this._buf.flush();
    }
  }
}
