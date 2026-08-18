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

class Session {
  readonly id = crypto.randomUUID();
}

// Stand in for the generated registry so `inject('Config')` is typed.
declare module './mod.ts' {
  interface VialRegistry {
    Config: Config;
    Session: Session;
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

  describe('injection idioms', () => {
    it('eager field initializer wires on plain new', () => {
      Doctor.reset();
      Doctor.prescribe(Config, 'SINGLETON');
      class Handler {
        config = inject('Config');
      }
      const h = new Handler();
      asserts.assert(h.config instanceof Config);
      asserts.assertStrictEquals(h.config, inject('Config'));
    });

    it('constructor default parameter wires on plain new', () => {
      Doctor.reset();
      Doctor.prescribe(Config, 'SINGLETON');
      class Handler {
        constructor(public config = inject('Config')) {}
      }
      asserts.assert(new Handler().config instanceof Config);
    });

    it('lazy getter resolves on first access, memoized, and defers registration', () => {
      Doctor.reset();
      class Handler {
        private __config?: Config;
        get config(): Config {
          return this.__config ??= inject('Config');
        }
      }
      // Constructing BEFORE the vial is registered is fine — lazy.
      const h = new Handler();
      asserts.assertThrows(() => h.config); // not registered yet
      Doctor.prescribe(Config, 'SINGLETON');
      const first = h.config;
      asserts.assert(first instanceof Config);
      asserts.assertStrictEquals(h.config, first); // memoized
    });

    it('ambient scope from resolve() reaches both eager idioms', () => {
      Doctor.reset();
      Doctor.prescribe(Session, 'SCOPED');
      class Handler {
        viaField = inject('Session');
        constructor(public viaCtor = inject('Session')) {}
      }
      const h = Doctor.resolve(Handler, 'req-1');
      asserts.assertStrictEquals(h.viaField, h.viaCtor);
      asserts.assertStrictEquals(h.viaField, Doctor.dispense(Session, 'req-1'));
    });

    it('an explicit scope argument beats the ambient scope', () => {
      Doctor.reset();
      Doctor.prescribe(Session, 'SCOPED');
      class Handler {
        pinned = inject('Session', 'background');
      }
      const h = Doctor.resolve(Handler, 'req-1');
      asserts.assertStrictEquals(
        h.pinned,
        Doctor.dispense(Session, 'background'),
      );
      asserts.assert(h.pinned !== Doctor.dispense(Session, 'req-1'));
    });
  });
});
