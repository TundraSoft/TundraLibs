/**
 * @fileoverview Tests for the @Vial decorator.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, Vial } from '../mod.ts';

describe('@Vial', () => {
  describe('Registration', () => {
    it('should register a class under each supported mode', () => {
      @Vial('SINGLETON')
      class VS_Singleton {}
      @Vial('TRANSIENT')
      class VS_Transient {}
      @Vial('SCOPED')
      class VS_Scoped {}

      asserts.assertEquals(Doctor.knows(VS_Singleton), true);
      asserts.assertEquals(Doctor.knows(VS_Transient), true);
      asserts.assertEquals(Doctor.knows(VS_Scoped), true);
    });
  });

  describe('Singleton mode', () => {
    it('should hand back the same instance every time', () => {
      @Vial('SINGLETON')
      class VS_SameInstance {
        public value = 'original';
      }

      const i1 = Doctor.dispense(VS_SameInstance);
      const i2 = Doctor.dispense(VS_SameInstance);
      asserts.assertStrictEquals(i1, i2);

      i1.value = 'modified';
      asserts.assertEquals(i2.value, 'modified');
    });
  });

  describe('Transient mode', () => {
    it('should hand back a fresh instance every time', () => {
      @Vial('TRANSIENT')
      class VS_Fresh {
        public value = 'original';
      }

      const i1 = Doctor.dispense(VS_Fresh);
      const i2 = Doctor.dispense(VS_Fresh);

      i1.value = 'modified';
      asserts.assertEquals(i1.value, 'modified');
      asserts.assertEquals(i2.value, 'original');
    });
  });

  describe('Scoped mode', () => {
    it('should share instances within a scope and isolate across scopes', () => {
      @Vial('SCOPED')
      class VS_PerScope {
        public value = 'original';
      }

      const sameA = Doctor.dispense(VS_PerScope, 'TEST_SCOPE');
      const sameB = Doctor.dispense(VS_PerScope, 'TEST_SCOPE');
      const other = Doctor.dispense(VS_PerScope, 'ANOTHER_SCOPE');

      asserts.assertStrictEquals(sameA, sameB);
      sameA.value = 'modified';
      asserts.assertEquals(sameB.value, 'modified');
      asserts.assertEquals(other.value, 'original');
    });
  });

  describe('Inheritance', () => {
    it('should preserve the inherited surface on registered subclasses', () => {
      @Vial('SINGLETON')
      class VS_Base {
        public baseMethod() {
          return 'base';
        }
      }

      @Vial('SINGLETON')
      class VS_Derived extends VS_Base {
        public derivedMethod() {
          return 'derived';
        }
      }

      const instance = Doctor.dispense(VS_Derived);
      asserts.assertEquals(instance.baseMethod(), 'base');
      asserts.assertEquals(instance.derivedMethod(), 'derived');
    });
  });
});
