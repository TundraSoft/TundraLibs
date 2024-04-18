import { TundraLibError } from '../../utils/TundraLibError.ts';

export class CacherBaseError extends TundraLibError {
  public readonly library = 'Cacher';
  declare meta:
    & { engine: 'MEMORY' | 'REDIS'; config: string }
    & Record<string, unknown>;

  constructor(
    message: string,
    meta:
      & { engine: 'MEMORY' | 'REDIS'; config: string }
      & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get engine(): 'MEMORY' | 'REDIS' {
    return this.meta.engine;
  }

  get config(): string {
    return this.meta.config;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.engine} ${this.meta.config}] ${this.name.toUpperCase()} - ${this.message}`;
  }
}
