import { DAMError } from './Base.ts';

export class TranslatorError extends DAMError {
  constructor(
    message: string,
    meta: {
      dialect: string;
    } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
