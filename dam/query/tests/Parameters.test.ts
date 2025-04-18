import { QueryParameters } from '../Parameters.ts';
import * as asserts from '$asserts';

Deno.test('DAM/Parameters', async (t) => {
  await t.step('should create a parameter and return its name', () => {
    const params = new QueryParameters('XXXXX');
    const param1 = params.create('value1');
    const param2 = params.create('value2');

    asserts.assertEquals(param1, 'XXXXX_0');
    asserts.assertEquals(param2, 'XXXXX_1');
  });

  await t.step('should return the same name for the same value', () => {
    const params = new QueryParameters('XXXXX');
    const param1 = params.create('value1');
    const param2 = params.create('value1');

    asserts.assertEquals(param1, param2);
  });

  await t.step('should return the correct size of parameters', () => {
    const params = new QueryParameters('XXXXX');
    params.create('value1');
    params.create('value2');
    params.create('value3');

    asserts.assertEquals(params.size, 3);
  });

  await t.step('should return parameters as a record', () => {
    const params = new QueryParameters('XXXXX');
    params.create('value1');
    params.create('value2');
    params.create('value3');

    const record = params.asRecord();

    asserts.assertEquals(record, {
      XXXXX_0: 'value1',
      XXXXX_1: 'value2',
      XXXXX_2: 'value3',
    });
  });

  await t.step('handle different data types correctly', () => {
    const params = new QueryParameters('XXXXX');
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
    params.create([1, 2, 3]);

    const record = params.asRecord();

    asserts.assertEquals(record, {
      XXXXX_0: 'value1',
      XXXXX_1: 123,
      XXXXX_2: JSON.stringify({ a: 1, b: 2 }),
      XXXXX_3: d,
      XXXXX_4: true,
      XXXXX_5: false,
      XXXXX_6: null,
      XXXXX_7: undefined,
      XXXXX_8: '[1,2,3]',
    });
  });

  await t.step('should handle empty prefix correctly', () => {
    const params = new QueryParameters('');
    const param1 = params.create('value1');

    asserts.assertEquals(
      param1,
      'P_0',
      "Should use 'P' as default when empty prefix is provided",
    );
  });

  await t.step('should work with SQL placeholders', () => {
    const params = new QueryParameters('param');
    const id = params.create(42);
    const name = params.create('test');

    const sql = `SELECT * FROM users WHERE id = :${id}: AND name = :${name}:`;

    asserts.assertEquals(
      sql,
      'SELECT * FROM users WHERE id = :param_0: AND name = :param_1:',
    );
    asserts.assertEquals(params.asRecord(), { param_0: 42, param_1: 'test' });
  });
});
