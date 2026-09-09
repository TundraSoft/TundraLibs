/**
 * @fileoverview {@link RapidJobEntry} — a registered job — stored by the app, consumed by
 * JOBTransport.
 *
 * @module
 */

import type { RapidJOBHandler } from './JOBHandler.ts';
import type { RapidContextState } from './context/State.ts';

/** A registered job — stored by the app, consumed by JOBTransport. */
export type RapidJobEntry<S extends RapidContextState = RapidContextState> = {
  name: string;
  /** 5-field cron expression, validated at registration. */
  schedule: string;
  handler: RapidJOBHandler<S>;
  /**
   * Default invocation params — every firing's `ctx.args.params` starts
   * from these; `triggerJob(name, args)` overrides merge on top.
   */
  args?: Readonly<Record<string, unknown>>;
};
