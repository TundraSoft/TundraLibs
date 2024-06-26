import { DAMClientError } from './Client.ts';

export class DAMClientConfigError extends DAMClientError {
  declare meta:
    & { dialect: string; configName: string }
    & Record<string, unknown>;

  constructor(
    meta: { dialect: string; configName: string } & Record<string, unknown>,
    cause?: Error,
  ) {
    super('Invalid configuration for ${configName}.', meta, cause);
  }
}
