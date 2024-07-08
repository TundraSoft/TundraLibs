// deno-lint-ignore-file
import { asserts } from '../../dev.dependencies.ts';
import { Dose, Innoculate, Vaccine, Vial } from '../mod.ts';

Deno.test('Vaccine', () => {
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

  @Innoculate()
  class TestService {
    @Dose()
    public singletonService!: SingletonService;
    @Dose()
    public transientService!: TransientService;
    @Dose()
    public scopedService!: ScopedService;
  }

  @Innoculate('SCOPE1')
  class TestService2 {
    @Dose()
    public singletonService!: SingletonService;
    @Dose()
    public transientService!: TransientService;
    @Dose()
    public scopedService!: ScopedService;
  }

  @Innoculate('SCOPE1')
  class TestService3 {
    @Dose()
    public singletonService!: SingletonService;
    @Dose()
    public transientService!: TransientService;
    @Dose()
    public scopedService!: ScopedService;
  }

  @Innoculate('SCOPE2')
  class TestService4 {
    @Dose()
    public singletonService!: SingletonService;
    @Dose()
    public transientService!: TransientService;
    @Dose()
    public scopedService!: ScopedService;
  }

  class ManualInjection {
    @Dose()
    public scopedService!: ScopedService;

    constructor() {
      Vaccine.innoculate(this, 'SCOPE1');
    }
  }

  const t1 = new TestService();
  const t2 = new TestService2();
  const t3 = new TestService3();
  const t4 = new TestService4();
  const t5 = new ManualInjection();

  // Singleton
  asserts.assertEquals(t1.singletonService, t2.singletonService);
  t1.singletonService.value = 'changed';
  asserts.assertEquals(t1.singletonService.value, 'changed');
  asserts.assertEquals(t1.singletonService.value, t2.singletonService.value);

  // Scoped
  asserts.assertEquals(t1.scopedService, t2.scopedService);
  asserts.assertEquals(t2.scopedService.value, 'test');
  asserts.assertEquals(t2.scopedService.value, t3.scopedService.value);
  t3.scopedService.value = 'changed';
  asserts.assertEquals(t2.scopedService.value, t3.scopedService.value);
  asserts.assertEquals(t4.scopedService.value, 'test');
  asserts.assertEquals(t2.scopedService.value, t5.scopedService.value);

  // Transient
  asserts.assertEquals(t1.transientService, t2.transientService);
  asserts.assertEquals(t2.transientService.value, 'test');
  t2.transientService.value = 'changed';
  t4.transientService.value = 'am changed too';
  asserts.assertEquals(t2.transientService.value, 'changed');
  asserts.assertEquals(t4.transientService.value, 'am changed too');
  asserts.assertNotEquals(t2.transientService.value, t3.transientService.value);
  asserts.assertNotEquals(t2.transientService.value, t4.transientService.value);
});
