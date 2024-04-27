import { DAMClientError } from '../Client.ts';

export class DAMNotSupported extends DAMClientError {
  constructor(
    meta: {
      dialect: string;
      config: string;
      method: string;
    },
  ) {
    super(
      'Method ${method} not supported by the client: ${dialect}',
      meta,
    );
  }
}
