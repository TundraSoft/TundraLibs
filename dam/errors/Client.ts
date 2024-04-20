import { DAMError } from './Base.ts';

export class DAMClientError extends DAMError {
  declare meta: { dialect: string; config: string };
  constructor(
    message: string,
    meta: { dialect: string; config: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get config(): string {
    return this.meta.config;
  }
}
