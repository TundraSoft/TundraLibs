import { DAMClientError } from './Client.ts';

export class DAMClientConnectionError extends DAMClientError {
  declare meta: { dialect: string; configName: string; errorCode?: string };

  constructor(
    meta: { dialect: string; configName: string; errorCode?: string },
    cause?: Error,
  ) {
    super(
      'Could not establish connection with server for ${configName}',
      meta,
      cause,
    );
  }

  get errorCode(): string | undefined {
    return this.meta.errorCode;
  }
}
