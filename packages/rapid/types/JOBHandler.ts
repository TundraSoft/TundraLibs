/**
 * @fileoverview {@link RapidJOBHandler} — the scheduled-job handler signature.
 *
 * @module
 */

import type { RapidContextResponse } from './context/Response.ts';
import type { JOBContext } from '../context/mod.ts';

export type RapidJOBHandler = (
  ctx: JOBContext,
) => RapidContextResponse | void | Promise<RapidContextResponse | void>;
