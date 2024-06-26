import { DAMClientError } from './Client.ts';

export class DAMClientNotConnectedError extends DAMClientError {
  declare meta: { dialect: string; configName: string };

  constructor(meta: { dialect: string; configName: string }, cause?: Error) {
    super('Trying to execute query before connecting', meta, cause);
  }
}
