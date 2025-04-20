import { assertEngine } from '../mod.ts';
import * as asserts from '$asserts';

Deno.test('DAM.Engines.assertEngine', () => {
  // Test with valid engine names
  asserts.assert(assertEngine('POSTGRES'));
  asserts.assert(assertEngine('MARIA'));
  asserts.assert(assertEngine('SQLITE'));
  asserts.assert(assertEngine('MONGO'));

  // Test with invalid engine names
  asserts.assert(!assertEngine('INVALID_ENGINE'));
  asserts.assert(!assertEngine(123));
  asserts.assert(!assertEngine({}));
  asserts.assert(!assertEngine([]));
});
