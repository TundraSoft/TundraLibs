import { asserts } from '../../../dev.dependencies.ts';
import { assertDialect, assertSQLDialect } from '../../mod.ts';

Deno.test('DAM > asserts > Dialect', async (t) => {
  await t.step('Dialects', () => {
    asserts.assertEquals(true, assertDialect('MARIA'));
    asserts.assertEquals(true, assertDialect('MONGO'));
    asserts.assertEquals(true, assertDialect('POSTGRES'));
    asserts.assertEquals(true, assertDialect('SQLITE'));
    asserts.assertEquals(false, assertSQLDialect('MARIAS'));
  });

  await t.step('SQL Dialects', () => {
    asserts.assertEquals(true, assertSQLDialect('MARIA'));
    asserts.assertEquals(true, assertSQLDialect('POSTGRES'));
    asserts.assertEquals(true, assertSQLDialect('SQLITE'));
    asserts.assertEquals(false, assertSQLDialect('MONGO'));
  });
});
