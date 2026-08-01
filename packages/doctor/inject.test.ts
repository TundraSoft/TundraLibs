/**
 * @fileoverview Tests for token-based resolution — `inject` and the
 * `Doctor.dispenseByName` it delegates to.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject } from './mod.ts';

class Config {
  readonly appName = 'demo';
}

// Stand in for the generated registry so `inject('Config')` is typed.
declare module './mod.ts' {
  interface VialRegistry {
    Config: Config;
  }
}

describe('inject / dispenseByName', () => {
  it('resolves a registered vial by its class-name token, typed', () => {
    Doctor.reset();
    Doctor.prescribe(Config, 'SINGLETON');
    const cfg = inject('Config'); // inferred as Config
    asserts.assertEquals(cfg.appName, 'demo');
  });

  it('returns the same singleton instance across calls', () => {
    Doctor.reset();
    Doctor.prescribe(Config, 'SINGLETON');
    asserts.assertStrictEquals(inject('Config'), inject('Config'));
  });

  it('throws UnregisteredVialError for an unknown token', () => {
    Doctor.reset();
    asserts.assertThrows(() => Doctor.dispenseByName('Nope'));
  });

  it('revoke drops the name entry', () => {
    Doctor.reset();
    Doctor.prescribe(Config, 'SINGLETON');
    asserts.assert(Doctor.dispenseByName('Config') instanceof Config);
    Doctor.revoke(Config);
    asserts.assertThrows(() => Doctor.dispenseByName('Config'));
  });

  it('reset clears the name index', () => {
    Doctor.prescribe(Config, 'SINGLETON');
    Doctor.reset();
    asserts.assertThrows(() => Doctor.dispenseByName('Config'));
  });
});
