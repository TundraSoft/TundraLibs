/**
 * "Shortly" — a URL shortener with blog features, deliberately
 * over-engineered to exercise every norm capability at once. One
 * folder per schema (Identity / Shortener / Blog / Audit), one entity
 * per file, cross-schema FKs by entity key throughout.
 *
 * PURE definitions — nothing here imports an engine or knows a
 * dialect, so this single model set serves both as the reference
 * example of a multi-schema norm app AND as the app every live
 * engine suite runs (tests/live-*.test.ts supply the engine; see
 * tests/suite.ts for the shared steps).
 *
 * @module
 */

export { Identity, Profiles, Users } from './identity/mod.ts';
export {
  ActiveLinks,
  Links,
  Shortener,
  TopLinks,
  Visits,
} from './shortener/mod.ts';
export { Blog, Posts, PostTags, Tags } from './blog/mod.ts';
export { Audit, AuditLog } from './audit/mod.ts';
