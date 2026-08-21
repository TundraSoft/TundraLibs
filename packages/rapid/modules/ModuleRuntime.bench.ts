/**
 * @fileoverview In-process cost of the module system's hot paths —
 * `invoke` (bare, and through one middleware), `emit` (0 / 2
 * subscribers), against a plain method call as the floor.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import {
  initModules,
  On,
  payload,
  RapidModule,
  type RapidModuleInvokeMiddleware,
  Use,
} from './mod.ts';

const pass: RapidModuleInvokeMiddleware = (_ctx, next) => next();

const EMITTER_EVENTS = { Tick: payload<{ n: number }>() };
class Emitter extends RapidModule<typeof EMITTER_EVENTS> {
  readonly name = 'Emitter';
  readonly namespace = 'bench';
  protected readonly events = EMITTER_EVENTS;
  plain(n: number): number {
    return n + 1;
  }
  @Use(pass)
  guarded(n: number): number {
    return n + 1;
  }
  tick(n: number): Promise<void> {
    return this.emit('Tick', { n });
  }
}
const SILENT_EVENTS = { Nothing: payload<number>() };
class Silent extends RapidModule<typeof SILENT_EVENTS> {
  readonly name = 'Silent';
  readonly namespace = 'silent';
  protected readonly events = SILENT_EVENTS;
  nothing(): Promise<void> {
    return this.emit('Nothing', 1);
  }
}
class Listener extends RapidModule {
  readonly name = 'Listener';
  readonly namespace = 'listen';
  protected readonly events = {};
  count = 0;
  @On('bench:Emitter:Tick')
  a() {
    this.count++;
  }
  @On('bench:Emitter:Tick')
  b() {
    this.count++;
  }
}

const { modules, runtime } = await initModules(
  { name: 'bench', logger: { handlers: [] } },
  { modules: [{ Emitter, Silent, Listener }] },
);

bench(
  'plain method call (floor)',
  { group: 'invoke', baseline: true },
  () => modules.Emitter.plain(1),
);
bench(
  'runtime.invoke — no middleware',
  { group: 'invoke' },
  () => runtime.invoke(Emitter, 'plain', [1]),
);
bench(
  'runtime.invoke — 1 middleware',
  { group: 'invoke' },
  () => runtime.invoke(Emitter, 'guarded', [1]),
);

bench(
  'emit — 0 subscribers',
  { group: 'emit', baseline: true },
  () => modules.Silent.nothing(),
);
bench(
  'emit — 2 subscribers (sync handlers)',
  { group: 'emit' },
  () => modules.Emitter.tick(1),
);

// Inside a request (how modules are actually called): the invocation
// INHERITS the ambient requestId, so no ULID is minted per call. This is
// the real hot path; the top-level numbers above include a ~0.5-1.3µs
// mint per call that production traffic doesn't pay.
import { ambient } from '@tundralibs/ambient';
const SCOPE = { requestId: '01BENCHREQUESTID000000000', action: 'bench' };
bench(
  'runtime.invoke — no middleware, INSIDE a request scope',
  { group: 'invoke' },
  () => ambient.run(SCOPE, () => runtime.invoke(Emitter, 'plain', [1])),
);
bench(
  'emit — 2 subscribers, INSIDE a request scope',
  { group: 'emit' },
  () => ambient.run(SCOPE, () => modules.Emitter.tick(1)),
);
