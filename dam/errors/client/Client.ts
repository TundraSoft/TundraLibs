import { DAMError } from '../Base.ts';

export class DAMClientError extends DAMError {
  declare meta:
    & { dialect: string; configName: string }
    & Record<string, unknown>;

  constructor(
    message: string,
    meta: { dialect: string; configName: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  get configName(): string {
    return this.meta.configName;
  }
}
