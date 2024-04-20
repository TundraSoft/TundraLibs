import { DAMClientError } from '../Client.ts';

export class DAMConfigError extends DAMClientError {
  declare meta: {
    dialect: string;
    config: string;
    item: string;
    value?: string;
  };

  constructor(
    message: string,
    meta:
      & { dialect: string; config: string; item: string; value?: string }
      & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }

  configItem(): string {
    return this.meta.item;
  }

  configValue(): string | undefined {
    return this.meta.value;
  }
}
