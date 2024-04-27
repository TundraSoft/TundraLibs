import { Dialects } from '../mod.ts';
import { DAMError } from './Base.ts';

export class DAMTranslatorError extends DAMError {
  constructor(
    message: string,
    meta: {
      dialect: Dialects;
    } & Record<string, unknown>,
    cause?: Error,
  ) {
    super(message, meta, cause);
  }
}
