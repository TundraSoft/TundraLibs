import { TundraLibError } from '../../utils/TundraLibError.ts';

export class CacherNotFound extends TundraLibError {
  public readonly library = 'Cacher';
  declare meta: { config: string } & Record<string, unknown>;

  constructor(
    meta: { config: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super('Unknown/Undefined Cache configuration name ${config}.', meta, cause);
  }

  get config(): string {
    return this.meta.config;
  }

  toString(): string {
    return `${this.timeStamp.toISOString()} [${this.library} ${this.meta.config}] ${this.name.toUpperCase()} - ${this.message}`;
  }
}
