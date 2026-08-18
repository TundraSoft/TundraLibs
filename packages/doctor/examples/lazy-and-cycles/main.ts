/**
 * @fileoverview Walks through the capabilities the other two examples
 * don't touch: a lazy getter breaking an otherwise-unbreakable
 * eager/eager cycle, `Doctor.checkup()` catching a missing dependency
 * at boot, deferred vial registration, and a live
 * `CircularDependencyError` from a cycle nothing breaks.
 *
 * Run with:
 *
 * ```bash
 * deno run packages/doctor/examples/lazy-and-cycles/main.ts
 * ```
 *
 * @module
 */

import './registry.ts';

import {
  CircularDependencyError,
  Doctor,
  inject,
  UnregisteredVialError,
  Vial,
} from '../../mod.ts';
import { JobLogger } from './JobLogger.ts';
import { JobQueue } from './JobQueue.ts';

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------
// Scenario 1: checkup() catches a missing dependency at boot
// ---------------------------------------------------------------
section('Scenario 1 — checkup() before Metrics is registered');

try {
  Doctor.checkup();
  console.log('checkup() passed — unexpected!');
} catch (err) {
  if (err instanceof UnregisteredVialError) {
    console.log(`checkup() failed loudly: ${err.message}`);
    console.log(`missing vial: ${err.context.vialName}`);
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------
// Scenario 2: deferred registration
// ---------------------------------------------------------------
section('Scenario 2 — registering Metrics late, then re-running checkup()');

await import('./Metrics.ts');
const checked = Doctor.checkup();
console.log(`checkup() passed — ${checked} singleton(s) dispensed`);

// ---------------------------------------------------------------
// Scenario 3: eager singleton cascade
// ---------------------------------------------------------------
section('Scenario 3 — enqueueing jobs');

const queue = Doctor.dispense(JobQueue);
queue.enqueue('send-welcome-email');
queue.enqueue('resize-thumbnail');
queue.enqueue('sync-crm');
console.log(`queue depth: ${queue.size()}`);

// ---------------------------------------------------------------
// Scenario 4: the lazy getter resolves the OTHER side of the cycle
// ---------------------------------------------------------------
section('Scenario 4 — lazy getter breaks the JobLogger ↔ JobQueue cycle');

const logger = Doctor.dispense(JobLogger);
logger.warnIfBackedUp(10);
logger.warnIfBackedUp(2);

// ---------------------------------------------------------------
// Scenario 5: an eager/eager cycle nothing breaks
// ---------------------------------------------------------------
section('Scenario 5 — an eager/eager cycle throws CircularDependencyError');

@Vial('SINGLETON')
class CycleA {
  public b = inject('CycleB');
}

// Registered by @Vial for its name ('CycleB'), never referenced
// directly: CycleA resolves it only through inject('CycleB'), by
// design — that's the whole point of token-based injection.
@Vial('SINGLETON')
// deno-lint-ignore no-unused-vars
class CycleB {
  public a = inject('CycleA');
}

declare module '../../mod.ts' {
  interface VialRegistry {
    CycleA: CycleA;
    CycleB: CycleB;
  }
}

try {
  Doctor.dispense(CycleA);
  console.log('resolved — unexpected!');
} catch (err) {
  if (err instanceof CircularDependencyError) {
    console.log(`caught: ${err.message}`);
    console.log(`detected while resolving: ${err.context.vialName}`);
    console.log('fix: make one side a lazy getter, like JobLogger.queue above');
  } else {
    throw err;
  }
}

console.log('\nDone.');
