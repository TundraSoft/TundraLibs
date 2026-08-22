/**
 * @fileoverview `@JOB` — declare a module method as a scheduled job.
 * Metadata-only, same contract as the HTTP decorators (see `http.ts`).
 * The cron schedule is validated AT DECORATION TIME (class definition
 * — a bad schedule fails at import, the loudest possible moment).
 *
 * @module
 */

import { parseSchedule } from '@tundralibs/cronus';
import { RapidError } from '../errors/mod.ts';
import type { RapidBinds, RapidModuleReply } from '../types/mod.ts';
import { assertMethodContext, recordDecoration } from './registry.ts';

/** The decorator signature the factory returns. */
type JobDecorator<This, A extends readonly unknown[]> = (
  target: (this: This, ...args: A) => RapidModuleReply,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: A) => RapidModuleReply
  >,
) => void;

/** Options for {@link JOB}. */
export type JobDecoratorOptions<A extends readonly unknown[]> = {
  /** Argument binders, in method-parameter order (see `http.ts`). */
  bind?: RapidBinds<A>;
  /**
   * Registration-default invocation params — `ctx.args.params` starts
   * from these; `triggerJob(name, args)` overrides merge on top.
   */
  args?: Readonly<Record<string, unknown>>;
};

/**
 * Declare the decorated method as a scheduled job.
 *
 * @param name - Unique job name.
 * @param schedule - 5-field cron expression, validated NOW.
 * @throws {RapidError} RAPID_CONFIG when `schedule` is invalid, at
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
  return (_target: object, context: ClassMethodDecoratorContext): void => {
    assertMethodContext(context, 'JOB');
    recordDecoration(context, {
      kind: 'JOB',
      name,
      schedule,
      args: options.args,
      binds: options.bind ?? [],
      methodName: String(context.name),
    });
  };
};
