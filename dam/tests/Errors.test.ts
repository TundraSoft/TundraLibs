import { asserts } from '../../dev.dependencies.ts';
import {
  DAMClientConfigError,
  DAMClientConnectionError,
  DAMClientMissingParamsError,
  DAMClientQueryError,
  DAMError,
} from '../mod.ts';

Deno.test('DAM > Errors', async (t) => {
  await t.step('DAMClientConfigError', () => {
    const a = new DAMClientConfigError({
      dialect: 'MARIA',
      configName: 'test',
    });
    asserts.assertInstanceOf(a, DAMClientConfigError);
    asserts.assertInstanceOf(a, DAMError);
    asserts.assertEquals(a.configName, 'test');
    asserts.assertEquals(a.dialect, 'MARIA');
    asserts.assert(a.toString().includes('MARIA'));
  });

  await t.step('DAMClientConnectionError', () => {
    const a = new DAMClientConnectionError({
      dialect: 'MARIA',
      configName: 'test',
      errorCode: '12',
    });
    asserts.assertInstanceOf(a, DAMClientConnectionError);
    asserts.assertInstanceOf(a, DAMError);
    asserts.assertEquals(a.configName, 'test');
    asserts.assertEquals(a.dialect, 'MARIA');
    asserts.assertEquals(a.errorCode, '12');
  });

  await t.step('DAMClientMissingParamsError', () => {
    const a = new DAMClientMissingParamsError(['a', 'f'], {
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:' },
    });
    asserts.assertInstanceOf(a, DAMClientMissingParamsError);
    asserts.assertInstanceOf(a, DAMError);
    asserts.assertEquals(a.configName, 'test');
    asserts.assertEquals(a.dialect, 'MARIA');
    asserts.assertEquals(a.missingParams, ['a', 'f']);
    asserts.assertEquals(a.sql, 'SELECT :a:, :f:');
    asserts.assertEquals(a.params, undefined);
  });

  await t.step('DAMClientQueryError', () => {
    const a = new DAMClientQueryError({
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:', params: { a: 1, f: 'sdf' } },
    });
    asserts.assertInstanceOf(a, DAMClientQueryError);
    asserts.assertInstanceOf(a, DAMError);
    asserts.assertEquals(a.configName, 'test');
    asserts.assertEquals(a.dialect, 'MARIA');
    asserts.assertEquals(a.sql, 'SELECT :a:, :f:');
    asserts.assertEquals(a.params, { a: 1, f: 'sdf' });
    asserts.assertEquals(a.errorCode, undefined);

    const b = new DAMClientQueryError({
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:', params: { a: 1, f: 'sdf' } },
      errorCode: '12',
    });
    asserts.assertInstanceOf(a, DAMClientQueryError);
    asserts.assertInstanceOf(a, DAMError);
    asserts.assertEquals(b.errorCode, '12');
  });
});
