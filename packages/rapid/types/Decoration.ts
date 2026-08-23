/**
 * @fileoverview {@link RapidDecoration} — one recorded decoration: the
 * registration a decorator declared for a module method.
 *
 * @module
 */

import type { HTTPMethod } from '@tundralibs/compat/http';
import type { RapidBinder } from './Binder.ts';

/**
 * One recorded decoration — pure registration DATA held in the
 * side-table until the module tier mounts the instance. A method can
 * carry several (multi-transport methods, route aliases); entries are
 * stored in DECORATOR APPLICATION ORDER, which is bottom-up relative
 * to the source (TC39 semantics) — mount-time consumers must not
 * attach meaning to it.
 */
export type RapidDecoration =
  | {
    kind: 'HTTP';
    /** The HTTP verb. */
    method: HTTPMethod;
    /** radrouter-native path (`/users/:id:`). */
    path: string;
    binds: readonly RapidBinder[];
    /** The decorated method's name (diagnostics). */
    methodName: string;
    /**
     * Radrouter version slot for this ROUTE specifically — overrides
     * the owning `@Module`'s `version` default, when both are set.
     */
    version?: string;
    /** One-line OpenAPI operation summary. */
    summary?: string;
    /** Longer OpenAPI operation description. */
    description?: string;
    /** OpenAPI tags, merged over the owning module's at mount. */
    tags?: readonly string[];
    /** OpenAPI operation id; defaults to `<Module>_<method>` at mount. */
    operationId?: string;
    /** Security-scheme names; `[]` = public. Overrides the module default. */
    security?: readonly string[];
    /**
     * The response shape — documentation only (the method's actual return
     * value is never checked against it): `buildOpenApi` emits its
     * `toOpenAPI()` as the 200 schema.
     */
    response?: { toOpenAPI?: () => unknown; toJSONSchema?: () => unknown };
  }
  | {
    kind: 'SOCKET';
    /** The rpc command name. */
    command: string;
    binds: readonly RapidBinder[];
    methodName: string;
  }
  | {
    kind: 'JOB';
    /** The job's registered name. */
    name: string;
    /** 5-field cron expression, validated at decoration time. */
    schedule: string;
    /** Registration-default invocation params. */
    args?: Readonly<Record<string, unknown>>;
    binds: readonly RapidBinder[];
    methodName: string;
  };
