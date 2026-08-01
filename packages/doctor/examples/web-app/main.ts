/**
 * @fileoverview Walks through the same scenarios that previously
 * surfaced bugs, now against the fixed implementation.
 *
 * Run with:
 *
 * ```bash
 * deno run packages/doctor/examples/web-app/main.ts
 * ```
 *
 * @module
 */

import './registry.ts';

import { Doctor } from '../../mod.ts';
import { Database } from './Database.ts';
import { Logger } from './Logger.ts';
import { UserHandler } from './UserHandler.ts';

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

// ---------------------------------------------------------------
// Scenario 1: Lazy singleton with cascade
// ---------------------------------------------------------------
section('Scenario 1 — singleton injection');

const logger = Doctor.dispense(Logger);
console.log(`Logger.config defined?      ${logger.config !== undefined}`);
console.log(`Logger.config.appName:      ${logger.config.appName}`);

// ---------------------------------------------------------------
// Scenario 2: Nested DI cascades
// ---------------------------------------------------------------
section('Scenario 2 — nested resolution');

const db = Doctor.dispense(Database, 'req-1');
console.log(`Database.config defined?    ${db.config !== undefined}`);
console.log(`Database.logger defined?    ${db.logger !== undefined}`);

// ---------------------------------------------------------------
// Scenario 3: Handle a request via Doctor.resolve
// ---------------------------------------------------------------
section('Scenario 3 — handle a request');

const h = Doctor.resolve(UserHandler, 'req-handler-1');
console.log(`handler.repo.db defined?    ${h.repo.db !== undefined}`);
h.handle(42);

// ---------------------------------------------------------------
// Scenario 4: Per-request scope works
// ---------------------------------------------------------------
section('Scenario 4 — per-request scope');

const h1 = Doctor.resolve(UserHandler, 'req-A');
const h2 = Doctor.resolve(UserHandler, 'req-B');
const h1Again = Doctor.resolve(UserHandler, 'req-A');
console.log(`h1.db === h2.db?            ${h1.db === h2.db}  (expect false)`);
console.log(
  `h1.db === h1Again.db?       ${
    h1.db === h1Again.db
  }  (expect true — same scope)`,
);
console.log(
  `h1.logger === h2.logger?    ${
    h1.logger === h2.logger
  }  (expect true — singleton)`,
);

// ---------------------------------------------------------------
// Scenario 5: Cleanup at end of request
// ---------------------------------------------------------------
section('Scenario 5 — discharge at end of request');

Doctor.discharge('req-A');
const h1AfterClear = Doctor.resolve(UserHandler, 'req-A');
console.log(
  `h1.db === h1AfterClear.db?  ${
    h1.db === h1AfterClear.db
  }  (expect false — scope was cleared)`,
);

console.log('\nDone.');
