/**
 * @fileoverview Tests for the @Dose decorator.
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, Dose, Inoculate, Vial } from '../mod.ts';
import { MissingDesignTypeError } from '../errors/mod.ts';

describe({
  name: '@Dose',
  // @Dose reads each property's `design:type` via reflect-metadata, which
  // needs emitDecoratorMetadata. Deno and Bun emit it; tsx/esbuild (the Node
  // test runner) cannot, so this runs on Deno and Bun only.
  node: false,
  fn: () => {
    describe('Metadata', () => {
      it('should attach one design:injectable entry per @Dose property', () => {
        @Vial('SINGLETON')
        class DS_Dep1 {
          public value = 'one';
        }
        @Vial('SINGLETON')
        class DS_Dep2 {
          public value = 'two';
        }

        class DS_Owner {
          @Dose()
          public d1!: DS_Dep1;
          @Dose()
          public d2!: DS_Dep2;
        }

        const injectables = Reflect.getMetadata('design:injectable', DS_Owner);
        asserts.assertEquals(injectables.length, 2);
        asserts.assertEquals(injectables[0].key, 'd1');
        asserts.assertEquals(injectables[1].key, 'd2');
      });
    });

    describe('Manual inoculation', () => {
      it('should let a constructor wire its own dependencies', () => {
        @Vial('SINGLETON')
        class DS_Manual {
          public value = 'manually injected';
        }

        class DS_ManualOwner {
          @Dose()
          public dep!: DS_Manual;
          constructor() {
            Doctor.treat(this);
          }
        }

        const instance = new DS_ManualOwner();
        asserts.assertEquals(instance.dep.value, 'manually injected');
      });
    });

    describe('Error handling', () => {
      it('should throw MissingDesignTypeError when design:type is missing', () => {
        const originalGetMetadata = Reflect.getMetadata;
        Reflect.getMetadata = function (...args: unknown[]) {
          if (args[0] === 'design:type') return undefined;
          return originalGetMetadata.apply(Reflect, args as any);
        };

        try {
          asserts.assertThrows(
            () => {
              class DS_NoMetadata {
                @Dose()
                public badDependency: any;
              }
              new DS_NoMetadata();
            },
            MissingDesignTypeError,
            'Type information is missing',
          );
        } finally {
          Reflect.getMetadata = originalGetMetadata;
        }
      });
    });

    describe('Inheritance', () => {
      it('should walk inherited @Dose metadata to inject subclass instances', () => {
        @Vial('SINGLETON')
        class DS_BaseDep {
          public value = 'base injected';
        }
        @Vial('SINGLETON')
        class DS_DerivedDep {
          public value = 'derived injected';
        }

        class DS_BaseOwner {
          @Dose()
          public baseDep!: DS_BaseDep;
        }

        class DS_DerivedOwner extends DS_BaseOwner {
          @Dose()
          public derivedDep!: DS_DerivedDep;
        }

        @Inoculate()
        class DS_LeafOwner extends DS_DerivedOwner {}

        const instance = new DS_LeafOwner();
        asserts.assertEquals(instance.baseDep.value, 'base injected');
        asserts.assertEquals(instance.derivedDep.value, 'derived injected');
      });
    });
  },
});
