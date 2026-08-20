/**
 * Dependency injection wiring via `@tundralibs/doctor`. Doctor 2.0 is
 * TC39-standard-decorator DI (no reflect-metadata, no legacy flags) — the
 * SAME decorator mode rAPId's `@Module`/`@GET` use, so the two compose
 * cleanly.
 *
 * The modules don't take their dependencies through the constructor; they
 * pull them with `inject('Token')` field initializers (see the modules).
 * That needs the tokens registered BEFORE a module is constructed —
 * `registerBlogServices()` does that at boot, binding the two runtime
 * singletons the modules ask for:
 *
 *   - `Norm`    — the connected `Norm` database instance.
 *   - `Slogger` — the app's logger (correlated per request via ambient).
 *
 * Registered by FACTORY (the instances are built at boot, not by doctor),
 * which is exactly what `prescribe(Class, { factory })` is for.
 *
 * @module
 */

import { Doctor } from '@tundralibs/doctor';
import { Norm } from '@tundralibs/norm';
import { Slogger } from '@tundralibs/slogger';

// Teach `inject()` what each token resolves to (typed, import-free at the
// call site). The token IS the class name.
declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Norm: Norm;
    Slogger: Slogger;
  }
}

/** Bind the boot-time `Norm` and logger instances to their tokens. */
export function registerBlogServices(norm: Norm, log: Slogger): void {
  Doctor.prescribe(Norm, { mode: 'SINGLETON', factory: () => norm });
  Doctor.prescribe(Slogger, { mode: 'SINGLETON', factory: () => log });
}
