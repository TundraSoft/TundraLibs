/**
 * @fileoverview Base error class for the mail package.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils/BaseError';

/**
 * Base class of every error the mail package throws. Catch it to handle
 * any IMAP failure in one place; branch on the subclasses to tell them
 * apart.
 *
 * @template M - Structured error context shape.
 */
export class MailError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {}
