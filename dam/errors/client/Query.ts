import { DAMClientError } from '../Client.ts';

export class DAMQueryError extends DAMClientError {
  constructor(
    meta: {
      dialect: string;
      config: string;
      sql: string;
      params?: Record<string, unknown>;
    },
    cause?: Error,
  ) {
    super(
      `Error when running query${cause ? ` - ${cause.message}` : ''}`,
      meta,
      cause,
    );
  }
}
