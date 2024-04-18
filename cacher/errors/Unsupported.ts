import { TundraLibError } from '../../utils/TundraLibError.ts';

export class UnsupportedCacherError extends TundraLibError {
  public readonly library = 'Cacher';
  declare meta: { engine: string; config: string } & Record<string, unknown>;

  constructor(
    meta: { config: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super('Unsupported cache engine ${engine} in ${config}.', meta, cause);
  }

  get config(): string {
    return this.meta.config;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.meta.config}] ${this.name.toUpperCase()} - ${this.message}`;
  }
}
