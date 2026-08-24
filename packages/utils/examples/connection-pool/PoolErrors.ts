/**
 * A `BaseError` subclass: a fixed `_messageTemplate` wraps every instance's
 * message, and `context` carries the offending option/value for callers
 * that want structured data instead of parsing text.
 * @module
 */
import { BaseError } from '@tundralibs/utils';

export type PoolErrorContext = {
  option: string;
  value: unknown;
  rule: string;
};

export class PoolConfigError extends BaseError<PoolErrorContext> {
  protected override get _messageTemplate(): string {
    return 'invalid connection pool option "${option}" (${value}): ${rule}';
  }
}
