import { DAMClientError } from '../Client.ts';

export class DAMConnectionError extends DAMClientError {
  declare meta: {
    dialect: string;
    config: string;
    errorCode?: string;
    errorMessage?: string;
  };
  constructor(
    meta: {
      dialect: string;
      config: string;
      errorCode?: string;
      errorMessage?: string;
    } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(
      'There was a problem establishing connection with the database server',
      meta,
      cause,
    );
  }

  get errorCode() {
    return this.meta.errorCode;
  }

  get errorMessage() {
    return this.meta.errorMessage;
  }
}
