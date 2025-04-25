import { BaseError } from '@tundralibs/utils';

export class DAMError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Template for formatting the error message
   */
  protected override get _messageTemplate(): string {
    return '${message}';
  }

  constructor(message: string, meta: M, cause?: Error) {
    super(message, meta, cause);
  }
}
