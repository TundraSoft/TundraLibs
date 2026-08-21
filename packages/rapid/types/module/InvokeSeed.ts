/**
 * @fileoverview {@link RapidModuleInvokeSeed} — explicit context for an
 * `invoke` that starts OUTSIDE any in-flight invocation (a test, a
 * script): the correlation id and the state (principal etc.) the target
 * method and its middleware should see.
 *
 * @module
 */

/** Seed for a top-level `invoke`. Inside a request both are inherited. */
export type RapidModuleInvokeSeed = {
  requestId?: string;
  state?: Record<string, unknown>;
};
