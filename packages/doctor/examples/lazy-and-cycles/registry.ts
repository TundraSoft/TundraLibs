/**
 * @fileoverview Carries the {@link VialRegistry} augmentation that
 * types every `inject('...')` token in the example (the role
 * `@tundralibs/doctor/build` plays in a real project), and
 * side-effect-imports the vials that register up front.
 *
 * Metrics is deliberately NOT imported here — main.ts loads it later
 * via a dynamic `import()` to demonstrate deferred registration (see
 * "Scenario 2" there). JobLogger and JobQueue register themselves as
 * soon as this module is imported, since `@Vial` registers at class
 * definition.
 *
 * @module
 */

import './JobLogger.ts';
import './JobQueue.ts';

declare module '../../mod.ts' {
  interface VialRegistry {
    JobLogger: import('./JobLogger.ts').JobLogger;
    JobQueue: import('./JobQueue.ts').JobQueue;
    Metrics: import('./Metrics.ts').Metrics;
  }
}
