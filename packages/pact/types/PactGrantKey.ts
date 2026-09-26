/**
 * A module name, optionally scoped to a tenant: `POST` or `acme::POST`.
 *
 * A bare `POST` (or `::POST`) is a global grant: it applies in every tenant,
 * which is how a super admin not tied to any tenant is expressed. A check on
 * `acme::POST` passes on the principal's `acme::POST` mask combined with its
 * global `POST` mask. The tenant is whatever the application uses to name
 * one; pact does not interpret it.
 *
 * @example
 * ```ts
 * import type { PactGrantKey } from '@tundralibs/pact';
 *
 * const global: PactGrantKey<'POST' | 'COMMENTS'> = 'POST';
 * const tenanted: PactGrantKey<'POST' | 'COMMENTS'> = 'acme::COMMENTS';
 * ```
 */
export type PactGrantKey<M extends string = string> = M | `${string}::${M}`;
