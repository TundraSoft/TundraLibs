// deno-lint-ignore-file
import * as asserts from '$asserts';
import {
  Dose,
  DoseFactory,
  DoseValue,
  Inoculate,
  Vaccine,
  Vial,
} from '../mod.ts';

Deno.test('Vaccine', async (d) => {
  await d.step('basic injection', async (t) => {
    // Define test services once for all tests
    @Vial('SINGLETON')
    class SingletonService {
      public value = 'test';
    }

    @Vial('TRANSIENT')
    class TransientService {
      public value = 'test';
    }

    @Vial('SCOPED')
    class ScopedService {
      public value = 'test';
    }

    await t.step('should inject dependencies with different lifetimes', () => {
      @Inoculate()
      class TestService {
        @Dose()
        public singletonService!: SingletonService;
        @Dose()
        public transientService!: TransientService;
        @Dose()
        public scopedService!: ScopedService;
      }

      const t1 = new TestService();
      const t2 = new TestService();

      // Singleton services should be the same instance
      asserts.assertStrictEquals(t1.singletonService, t2.singletonService);

      // Singleton value changes should be visible across all instances
      t1.singletonService.value = 'changed';
      asserts.assertEquals(t2.singletonService.value, 'changed');

      // Transient services should be different instances
      asserts.assertNotStrictEquals(t1.transientService, t2.transientService);

      // Changes to transient services should not affect other instances
      t1.transientService.value = 'changed';
      asserts.assertEquals(t1.transientService.value, 'changed');
      asserts.assertEquals(t2.transientService.value, 'test');
    });

    await t.step('should handle scoped injection correctly', () => {
      @Inoculate('SCOPE1')
      class TestService2 {
        @Dose()
        public singletonService!: SingletonService;
        @Dose()
        public transientService!: TransientService;
        @Dose()
        public scopedService!: ScopedService;
      }

      @Inoculate('SCOPE1')
      class TestService3 {
        @Dose()
        public singletonService!: SingletonService;
        @Dose()
        public transientService!: TransientService;
        @Dose()
        public scopedService!: ScopedService;
      }

      @Inoculate('SCOPE2')
      class TestService4 {
        @Dose()
        public singletonService!: SingletonService;
        @Dose()
        public transientService!: TransientService;
        @Dose()
        public scopedService!: ScopedService;
      }

      const t2 = new TestService2();
      const t3 = new TestService3();
      const t4 = new TestService4();

      // Same scope should have same scoped service instance
      asserts.assertStrictEquals(t2.scopedService, t3.scopedService);

      // Different scopes should have different instances
      asserts.assertNotStrictEquals(t2.scopedService, t4.scopedService);

      // Changes to scoped services should be visible within the same scope
      t2.scopedService.value = 'changed';
      asserts.assertEquals(t3.scopedService.value, 'changed');
      asserts.assertEquals(t4.scopedService.value, 'test');
    });

    await t.step('should support manual injection', () => {
      class ManualInjection {
        @Dose()
        public scopedService!: ScopedService;

        constructor() {
          Vaccine.inoculate(this, 'SCOPE1');
        }
      }

      @Inoculate('SCOPE1')
      class TestWithSameScope {
        @Dose()
        public scopedService!: ScopedService;
      }

      const t5 = new ManualInjection();
      const t2 = new TestWithSameScope();

      // Manually injected service with same scope should be the same instance
      asserts.assertStrictEquals(t5.scopedService, t2.scopedService);

      // Changes should be visible to all instances using the same scope
      t5.scopedService.value = 'manually changed';
      asserts.assertEquals(t2.scopedService.value, 'manually changed');
    });

    await t.step('should throw error for missing dependencies', () => {
      class ManualInjection {
        @Dose()
        public scopedService!: ScopedService;

        constructor() {
          Vaccine.inoculate(this, 'SCOPE1');
        }
      }
      @Inoculate('SCOPEn')
      class NoDeps {
        @Dose()
        public mi!: ManualInjection; // ManualInjection is not registered
      }

      // Should throw error when instantiating with missing dependency
      asserts.assertThrows(() => new NoDeps(), Error);
    });
  });

  await d.step('factory injection', async (t) => {
    await t.step('should inject factory-created instances', () => {
      // Create a simple config service
      class ConfigService {
        constructor(public readonly config: Record<string, string> = {}) {}
      }

      // Factory function for creating a config service
      function createConfigService() {
        return new ConfigService({
          environment: 'test',
          database: 'memory',
        });
      }

      // Test service using factory injection
      @Inoculate()
      class ServiceWithFactory {
        @DoseFactory(createConfigService)
        public configService!: ConfigService;
      }

      const instance = new ServiceWithFactory();

      // Verify the factory created the service correctly
      asserts.assertExists(instance.configService);
      asserts.assertEquals(instance.configService.config.environment, 'test');
      asserts.assertEquals(instance.configService.config.database, 'memory');

      // Each instance should get a new factory-created instance
      const instance2 = new ServiceWithFactory();
      asserts.assertNotStrictEquals(
        instance.configService,
        instance2.configService,
      );
    });

    await t.step('should support programmatic factory registration', () => {
      // Register a factory with the Vaccine
      Vaccine.addFactory('dynamicConfig', () => ({
        version: '1.0.0',
        features: ['a', 'b', 'c'],
      }));

      class FactoryConsumer {
        @Dose()
        public dynamicConfig!: { version: string; features: string[] };
      }

      const consumer = new FactoryConsumer();
      Vaccine.inoculate(consumer);

      asserts.assertExists(consumer.dynamicConfig);
      asserts.assertEquals(consumer.dynamicConfig.version, '1.0.0');
      asserts.assertEquals(consumer.dynamicConfig.features.length, 3);

      // Singleton factory services should be the same instance
      const consumer2 = new FactoryConsumer();
      Vaccine.inoculate(consumer2);
      asserts.assertStrictEquals(
        consumer.dynamicConfig,
        consumer2.dynamicConfig,
      );
    });

    await t.step('should handle factory errors gracefully', () => {
      function brokenFactory() {
        throw new Error('Factory failed');
      }

      class BrokenFactoryTest {
        @DoseFactory(brokenFactory)
        public service!: unknown;
      }

      const error = asserts.assertThrows(() => {
        Vaccine.inoculate(new BrokenFactoryTest());
      });

      asserts.assertStringIncludes((error as Error).message, 'Factory failed');
    });
  });

  await d.step('value injection', async (t) => {
    await t.step('should inject constant values', () => {
      const API_KEY = 'test-api-key-12345';
      const API_URL = 'https://api.example.com';
      const CONFIG = { timeout: 5000, retries: 3 };

      @Inoculate()
      class ServiceWithValues {
        @DoseValue(API_KEY)
        public apiKey!: string;

        @DoseValue(API_URL)
        public apiUrl!: string;

        @DoseValue(CONFIG)
        public config!: { timeout: number; retries: number };
      }

      const instance = new ServiceWithValues();

      // Values should be injected correctly
      asserts.assertEquals(instance.apiKey, API_KEY);
      asserts.assertEquals(instance.apiUrl, API_URL);
      asserts.assertEquals(instance.config, CONFIG);
    });

    await t.step('should inject values by reference for objects', () => {
      const CONFIG = { timeout: 5000, retries: 3 };

      @Inoculate()
      class ValueReferenceTest {
        @DoseValue(CONFIG)
        public config!: typeof CONFIG;
      }

      const instance = new ValueReferenceTest();

      // Original object changes should be reflected in injected value
      CONFIG.timeout = 10000;
      asserts.assertEquals(instance.config.timeout, 10000);
    });

    await t.step('should share values between instances', () => {
      const SHARED_VALUE = { id: 'shared', count: 0 };

      @Inoculate()
      class SharedValueTest {
        @DoseValue(SHARED_VALUE)
        public value!: typeof SHARED_VALUE;
      }

      const instance1 = new SharedValueTest();
      const instance2 = new SharedValueTest();

      // Both instances should reference the same object
      asserts.assertStrictEquals(instance1.value, instance2.value);

      // Changes should be visible to both instances
      instance1.value.count++;
      asserts.assertEquals(instance2.value.count, 1);
    });
  });

  await d.step('mixed injection types', async (t) => {
    await t.step('should support multiple injection types in one class', () => {
      @Vial('SINGLETON')
      class SingletonService {
        public value = 'singleton';
      }

      const STATIC_VALUE = { id: 'static-123', name: 'Static Value' };

      // Create a factory with a unique counter to ensure different values
      let counter = 0;
      function createFactory() {
        return {
          created: true,
          timestamp: Date.now(),
          uniqueId: counter++, // Add a unique counter value
        };
      }

      @Inoculate()
      class MixedInjectionTest {
        @Dose()
        public singleton!: SingletonService;

        @DoseValue(STATIC_VALUE)
        public staticValue!: typeof STATIC_VALUE;

        @DoseFactory(createFactory)
        public factoryValue!: {
          created: boolean;
          timestamp: number;
          uniqueId: number;
        };
      }

      const instance = new MixedInjectionTest();

      // All three types of injection should work together
      asserts.assertEquals(instance.singleton.value, 'singleton');
      asserts.assertEquals(instance.staticValue.id, 'static-123');
      asserts.assertEquals(instance.factoryValue.created, true);

      // Create a second instance to verify behavior
      const instance2 = new MixedInjectionTest();

      // Singleton should be the same instance
      asserts.assertStrictEquals(instance.singleton, instance2.singleton);

      // Value should be the same object
      asserts.assertStrictEquals(instance.staticValue, instance2.staticValue);

      // Factory creates a new instance each time
      asserts.assertNotStrictEquals(
        instance.factoryValue,
        instance2.factoryValue,
      );

      // Instead of comparing timestamps (which could be the same),
      // compare the unique counter values that must be different
      asserts.assertNotEquals(
        instance.factoryValue.uniqueId,
        instance2.factoryValue.uniqueId,
      );
    });
  });

  await d.step('error handling', async (t) => {
    // @TODO - Figure out how to test circular dependencies
    // await t.step('should detect circular dependencies', () => {
    //   @Vial('SINGLETON')
    //   class ServiceA {
    //     @Dose()
    //     public serviceB!: ServiceB;
    //   }

    //   @Vial('SINGLETON')
    //   class ServiceB {
    //     @Dose()
    //     public serviceA!: ServiceA;
    //   }

    //   const error = asserts.assertThrows(() => {
    //     @Inoculate()
    //     class TestCircular {
    //       @Dose()
    //       public serviceA!: ServiceA;
    //     }

    //     new TestCircular();
    //   });

    //   asserts.assertStringIncludes(
    //     (error as Error).message,
    //     'Circular dependency detected',
    //   );
    // });

    await t.step('should handle unregistered services', () => {
      class UnregisteredService {}

      class UnregisteredTest {
        @Dose()
        public service!: UnregisteredService;
      }

      const error = asserts.assertThrows(() => {
        Vaccine.inoculate(new UnregisteredTest());
      });

      asserts.assertStringIncludes((error as Error).message, 'not registered');
    });

    await t.step('should reject invalid instances', () => {
      const error = asserts.assertThrows(() => {
        Vaccine.inoculate(null);
      });

      asserts.assertStringIncludes(
        (error as Error).message,
        'undefined or null instance',
      );
    });

    await t.step('should reject conflicting decorator options', () => {
      const error = asserts.assertThrows(() => {
        class TestConflict {
          @Dose({ isFactory: true, isValue: true })
          public service!: unknown;
        }

        new TestConflict();
      });

      asserts.assertStringIncludes(
        (error as Error).message,
        'cannot be both a factory and a value',
      );
    });
  });
});
