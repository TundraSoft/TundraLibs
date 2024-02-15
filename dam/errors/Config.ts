import { DAMClientError } from './Client.ts';

export class DAMConfigError extends DAMClientError {
  constructor(
    message: string,
    metaTags: { dialect: string; name: string; item: string },
  ) {
    super(message, metaTags);
  }
}
