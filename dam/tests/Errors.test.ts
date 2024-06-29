import { assertEquals, assertInstanceOf } from '../../dev.dependencies.ts';
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
    assertInstanceOf(a, DAMClientConfigError);
    assertInstanceOf(a, DAMError);
    assertEquals(a.configName, 'test');
    assertEquals(a.dialect, 'MARIA');
  });

  await t.step('DAMClientConnectionError', () => {
    const a = new DAMClientConnectionError({
      dialect: 'MARIA',
      configName: 'test',
      errorCode: '12',
    });
    assertInstanceOf(a, DAMClientConnectionError);
    assertInstanceOf(a, DAMError);
    assertEquals(a.configName, 'test');
    assertEquals(a.dialect, 'MARIA');
    assertEquals(a.errorCode, '12');
  });

  await t.step('DAMClientMissingParamsError', () => {
    const a = new DAMClientMissingParamsError(['a', 'f'], {
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:' },
    });
    assertInstanceOf(a, DAMClientMissingParamsError);
    assertInstanceOf(a, DAMError);
    assertEquals(a.configName, 'test');
    assertEquals(a.dialect, 'MARIA');
    assertEquals(a.missingParams, ['a', 'f']);
    assertEquals(a.sql, 'SELECT :a:, :f:');
    assertEquals(a.params, undefined);
  });

  await t.step('DAMClientQueryError', () => {
    const a = new DAMClientQueryError({
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:', params: { a: 1, f: 'sdf' } },
    });
    assertInstanceOf(a, DAMClientQueryError);
    assertInstanceOf(a, DAMError);
    assertEquals(a.configName, 'test');
    assertEquals(a.dialect, 'MARIA');
    assertEquals(a.sql, 'SELECT :a:, :f:');
    assertEquals(a.params, { a: 1, f: 'sdf' });
    assertEquals(a.errorCode, undefined);

    const b = new DAMClientQueryError({
      dialect: 'MARIA',
      configName: 'test',
      query: { sql: 'SELECT :a:, :f:', params: { a: 1, f: 'sdf' } },
      errorCode: '12',
    });
    assertInstanceOf(a, DAMClientQueryError);
    assertInstanceOf(a, DAMError);
    assertEquals(b.errorCode, '12');
  });
});
