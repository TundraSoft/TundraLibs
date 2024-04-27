import { Parameters } from '../Parameters.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test('DAM/Parameters', async (t) => {
  await t.step('should create a parameter and return its name', () => {
    const params = new Parameters('XXXXX');
    const param1 = params.create('value1');
    const param2 = params.create('value2');

    assertEquals(param1, 'p_XXXXX_0');
    assertEquals(param2, 'p_XXXXX_1');
  });

  await t.step('should return the same name for the same value', () => {
    const params = new Parameters('XXXXX');
    const param1 = params.create('value1');
    const param2 = params.create('value1');

    assertEquals(param1, param2);
  });

  await t.step('should return the correct size of parameters', () => {
    const params = new Parameters('XXXXX');
    params.create('value1');
    params.create('value2');
    params.create('value3');

    assertEquals(params.size, 3);
  });

  await t.step('should return parameters as a record', () => {
    const params = new Parameters('XXXXX');
    params.create('value1');
    params.create('value2');
    params.create('value3');

    const record = params.asRecord();

    assertEquals(record, {
      p_XXXXX_0: 'value1',
      p_XXXXX_1: 'value2',
      p_XXXXX_2: 'value3',
    });
  });

  await t.step('handle different data types correctly', () => {
    const params = new Parameters('XXXXX');
    const d = new Date();
    params.create('value1');
    params.create(123);
    params.create({ a: 1, b: 2 });
    params.create(d);
    params.create(true);
    params.create(false);
    params.create(null);
    params.create(undefined);
    params.create('value1');
    params.create({ a: 1, b: 2 });
    params.create(123);
    params.create(d);
    params.create(true);
    params.create(false);
    params.create(null);
    params.create(undefined);

    const record = params.asRecord();

    assertEquals(record, {
      p_XXXXX_0: 'value1',
      p_XXXXX_1: 123,
      p_XXXXX_2: JSON.stringify({ a: 1, b: 2 }),
      p_XXXXX_3: d,
      p_XXXXX_4: true,
      p_XXXXX_5: false,
      p_XXXXX_6: null,
      p_XXXXX_7: undefined,
    });
  });
});
