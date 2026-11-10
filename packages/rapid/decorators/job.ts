/**
 * @fileoverview `@JOB` — declare a module method as a scheduled job.
 * Metadata-only, same contract as the HTTP decorators (see `http.ts`).
 * The cron schedule is validated AT DECORATION TIME (class definition
 * — a bad schedule fails at import, the loudest possible moment).
 *
 * @module
 */

import { matches, parseSchedule } from '@tundralibs/cronus';
import { RapidError } from '../errors/mod.ts';
import type { RapidBinds, RapidModuleReply } from '../types/mod.ts';
import {
  assertAccess,
  assertMethodContext,
  recordAccess,
  recordDecoration,
} from './registry.ts';

/** The decorator signature the factory returns. */
type JobDecorator<This, A extends readonly unknown[]> = (
  target: (this: This, ...args: A) => RapidModuleReply,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: A) => RapidModuleReply
  >,
) => void;

const EVERY_MINUTE = parseSchedule('* * * * *');

/**
 * Registration-time check for a `timezone`: a zone the scheduler can
 * read a schedule in. Internal — shared with `app.job()` and the
 * `jobs.timezone` option.
 *
 * @throws {RapidError} RAPID_CONFIG naming `where`.
 */
export function assertTimezone(where: string, timezone: unknown): void {
  try {
    matches(EVERY_MINUTE, new Date(0), timezone as string);
  } catch (cause) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${where} must be an IANA time zone name (e.g. 'Asia/Kolkata')`,
      details: { timezone },
      cause: cause instanceof Error ? cause : undefined,
    });
  }
}

/** Options for {@link JOB}. */
export type JobDecoratorOptions<A extends readonly unknown[]> = {
  /**
   * Argument binders, in method-parameter order (see `http.ts`).
   * @default [] — the method takes no parameters
   */
  bind?: RapidBinds<A>;
  /**
   * Registration-default invocation params — `ctx.args.params` starts
   * from these; `triggerJob(name, args)` overrides merge on top.
   */
  args?: Readonly<Record<string, unknown>>;
  /**
   * Who may run this job — see `RouteDecoratorOptions.access`. A scheduled
   * firing has whatever identity the auth binding's `authenticate` gives a
   * JOB context (none, or a system identity the policy recognises).
   */
  access?: string;
  /**
   * IANA time zone the schedule is read in.
   * @default the app's `jobs.timezone`, else the server's local clock
   */
  timezone?: string;
};

/**
 * Declare the decorated method as a scheduled job.
 *
 * @param name - Unique job name.
 * @param schedule - 5-field cron expression, validated NOW.
 * @throws {RapidError} RAPID_CONFIG when `schedule` or `timezone` is invalid, at
 *   decoration time under legacy decorator compilation, or on a
 *   non-method/static/private target.
 */
export const JOB: {
  <This>(name: string, schedule: string): JobDecorator<This, []>;
  <This>(
    name: string,
    schedule: string,
    options: Omit<JobDecoratorOptions<[]>, 'bind'>,
  ): JobDecorator<This, []>;
  <This, A extends readonly unknown[]>(
    name: string,
    schedule: string,
    options: JobDecoratorOptions<A> & { bind: RapidBinds<A> },
  ): JobDecorator<This, A>;
} = (
  name: string,
  schedule: string,
  options: JobDecoratorOptions<readonly unknown[]> = {},
  // deno-lint-ignore no-explicit-any
): any => {
  try {
    parseSchedule(schedule);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new RapidError('RAPID_CONFIG', {
      message: `@JOB '${name}' has an invalid schedule: ${reason}`,
      details: { name, schedule, reason },
      cause: cause instanceof Error ? cause : undefined,
    });
  }
  if (options.access !== undefined) assertAccess('@JOB', options.access);
  if (options.timezone !== undefined) {
    assertTimezone(`@JOB '${name}' timezone`, options.timezone);
  }
  return (_target: object, context: ClassMethodDecoratorContext): void => {
    assertMethodContext(context, 'JOB');
    if (options.access !== undefined) {
      recordAccess(context, options.access, 'JOB');
    }
    recordDecoration(context, {
      kind: 'JOB',
      name,
      schedule,
      args: options.args,
      binds: options.bind ?? [],
      methodName: String(context.name),
      ...(options.access !== undefined ? { access: options.access } : {}),
      ...(options.timezone !== undefined ? { timezone: options.timezone } : {}),
    });
  };
};
