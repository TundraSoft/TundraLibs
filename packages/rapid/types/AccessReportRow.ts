/**
 * @fileoverview {@link RapidAccessReportRow} — one line of the access
 * audit: what an action is and what `access` it declares, if any.
 *
 * @module
 */

/** One action as the access audit lists it. */
export type RapidAccessReportRow = {
  /** `HTTP` route, `SOCKET` command, `JOB` or an unrouted module `ACTION`. */
  kind: 'HTTP' | 'SOCKET' | 'JOB' | 'ACTION';
  /** `METHOD /path`, the command, the job name, or `namespace:Module.method`. */
  action: string;
  /** The declared string as written; absent means public (undeclared). */
  access?: string;
  /** A cached route's policy, `'<seconds>s'` plus each key binder's source (`+query`); absent when uncached. */
  cache?: string;
};
