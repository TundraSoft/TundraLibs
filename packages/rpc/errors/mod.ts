/**
 * Error surface for `@tundralibs/rpc` — the base {@link RpcError} plus the
 * config, registration, and state error subclasses raised by Server/Client.
 *
 * @module
 */
export { RpcError } from './Base.ts';
export { RpcConfigError } from './RpcConfigError.ts';
export { RpcRegistrationError } from './RpcRegistrationError.ts';
export { RpcStateError } from './RpcStateError.ts';
