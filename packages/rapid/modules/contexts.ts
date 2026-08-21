/**
 * @fileoverview The two module-system invocation contexts. Deliberately
 * LEAN — plain fields, no headers/URL/body machinery — because every
 * `invoke` and every event delivery allocates one. (While the POC lives
 * under `modules/` these stand alone; on integration they join rAPId's
 * `RapidContext` union as INVOKE/EVENT.)
 *
 * @module
 */

import type { RapidModuleInvokeResult } from './types/mod.ts';

/** Construction data for an {@link InvokeContext}. */
export type InvokeContextInit = {
  requestId: string;
  action: string;
  state: Record<string, unknown>;
  target: string;
  method: string;
  args: readonly unknown[];
};

/**
 * An in-process invocation of a module method THROUGH the cycle: the
 * caller's state (principal, …) flows in, the target's `@Use` middleware
 * runs, and the outcome comes back as an envelope.
 */
export class InvokeContext {
  public readonly type = 'INVOKE' as const;
  public readonly requestId: string;
  public readonly action: string;
  /** Inherited from the calling invocation (or the seed); shared, not copied. */
  public readonly state: Record<string, unknown>;
  /** `namespace:Module` of the target. */
  public readonly target: string;
  public readonly method: string;
  public readonly args: readonly unknown[];
  /** Set by dispatch, or by middleware to short-circuit. */
  public response: RapidModuleInvokeResult | null = null;

  constructor(init: InvokeContextInit) {
    this.requestId = init.requestId;
    this.action = init.action;
    this.state = init.state;
    this.target = init.target;
    this.method = init.method;
    this.args = init.args;
  }
}

/** Construction data for an {@link EventContext}. */
export type EventContextInit = {
  requestId: string;
  action: string;
  event: string;
};

const EMPTY_STATE: Readonly<Record<string, never>> = Object.freeze({});

/**
 * One subscriber's delivery of one event. Carries CORRELATION only: the
 * originating `requestId` (a trace id, zero authority) — never the
 * originating request's state. An event is a fact, not a request.
 */
export class EventContext {
  public readonly type = 'EVENT' as const;
  public readonly requestId: string;
  public readonly action: string;
  /** The qualified event name (`namespace:Module:EventName`). */
  public readonly event: string;
  /** Always empty and frozen — subscribers act on facts, not on behalf of a caller. */
  public readonly state: Readonly<Record<string, never>> = EMPTY_STATE;

  constructor(init: EventContextInit) {
    this.requestId = init.requestId;
    this.action = init.action;
    this.event = init.event;
  }
}
