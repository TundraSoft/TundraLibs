/**
 * SCOPED: one per named scope — the per-request database connection.
 * Resolving it with no scope (explicit or ambient) throws
 * `ScopeRequiredError`; `Doctor.discharge(scope)` drops it. @module
 */
import { inject, Vial } from '@tundralibs/doctor';
import { Logger } from './Logger.ts';

let next = 0;

@Vial('SCOPED')
export class Connection {
  readonly id = ++next;
  readonly log = inject(Logger);
  readonly rows = new Map<string, { amount: number; at: string }>();
  constructor() {
    this.log.info(`connection #${this.id} opened`);
  }
}
