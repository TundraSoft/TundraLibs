import { DAMClientError } from './Client.ts';

export class DAMQueryError extends DAMClientError {
  constructor(
    message: string,
    metaTags: {
      dialect: string;
      name: string;
      query: string;
      params?: Record<string, unknown>;
    } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, metaTags, cause);
  }
}
