import { assertEquals } from '../../../dev.dependencies.ts';
import { assertDialect, assertSQLDialect } from '../../mod.ts';

Deno.test('DAM > asserts > Dialect', async (t) => {
  await t.step('Dialects', () => {
    assertEquals(true, assertDialect('MARIA'));
    assertEquals(true, assertDialect('MONGO'));
    assertEquals(true, assertDialect('POSTGRES'));
    assertEquals(true, assertDialect('SQLITE'));
    assertEquals(false, assertSQLDialect('MARIAS'));
  });

  await t.step('SQL Dialects', () => {
    assertEquals(true, assertSQLDialect('MARIA'));
    assertEquals(true, assertSQLDialect('POSTGRES'));
    assertEquals(true, assertSQLDialect('SQLITE'));
    assertEquals(false, assertSQLDialect('MONGO'));
  });
});
