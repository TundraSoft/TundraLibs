/**
 * @fileoverview Re-exports the Slogger error hierarchy.
 *
 * @module
 */

export { SloggerError } from './Base.ts';
export { SloggerConfigError } from './SloggerConfigError.ts';
export {
  SloggerFinalizeError,
  type SloggerFinalizeFailure,
} from './SloggerFinalizeError.ts';
export {
  SloggerHandlerError,
  type SloggerHandlerErrorContext,
} from './SloggerHandlerError.ts';
