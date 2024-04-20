import { DAMClientError } from '../Client.ts';

export class DAMMissingParams extends DAMClientError {
  constructor(
    meta: {
      dialect: string;
      config: string;
      sql: string;
      params?: Record<string, unknown>;
      missing: string[];
    },
  ) {
    super(
      `Parameters missing in query: ${meta.missing.join(', ')}`,
      meta,
    );
  }
}
