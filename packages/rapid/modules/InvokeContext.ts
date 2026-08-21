/**
 * @fileoverview `InvokeContext` — one in-process invocation of a module
 * method THROUGH the cycle. Lean by design (plain fields, no
 * headers/URL/body machinery): every `invoke` allocates one.
 *
 * @module
 */

import type { Reply } from './reply.ts';

/** Construction data for an {@link InvokeContext}. */
export type InvokeContextInit = {
  requestId: string;
  action: string;
  state: Record<string, unknown>;
  target: string;
  method: string;
  args: readonly unknown[];
  auth?: Record<string, unknown>;
};

export class InvokeContext {
  /** The context discriminator — always `'INVOKE'`. */
  public readonly type = 'INVOKE' as const;
  /** The invocation's correlation id — inherited from the caller, the seed, or minted. */
  public readonly requestId: string;
  /** Uniform invocation identity — `invoke <namespace:Module>.<method>`. */
  public readonly action: string;
  /**
   * A SHALLOW COPY of the caller's state (or the seed): middleware and
   * the target may add keys for this invocation without rewriting the
   * caller's bag. Nested objects (a principal) are shared by reference.
   */
  public readonly state: Record<string, unknown>;
  /** `namespace:Module` of the target. */
  public readonly target: string;
  /** The invoked method name. */
  public readonly method: string;
  /** The positional arguments passed to the method. */
  public readonly args: readonly unknown[];
  /** The caller's authenticated identity, flowed in via the seed. */
  public readonly auth?: Record<string, unknown>;
  /** Set by dispatch, or by middleware to short-circuit. */
  public response: Reply | null = null;

  /** Populate the invocation's identity, copied-in state, target, method, args, and auth. */
  constructor(init: InvokeContextInit) {
    this.requestId = init.requestId;
    this.action = init.action;
    this.state = init.state;
    this.target = init.target;
    this.method = init.method;
    this.args = init.args;
    this.auth = init.auth;
  }
}
