import * as asserts from '$asserts';
import { assertColumnIdentifier } from './Column.ts';

Deno.test('OQL.asserts.Column', async (a) => {
  await a.step('ColumnIdentifier', async (b) => {
    await b.step('should validate simple column identifiers', () => {
      // Should pass
      assertColumnIdentifier('$id');
      assertColumnIdentifier('$name');
      assertColumnIdentifier('$user_id');

      // Should fail
      asserts.assertThrows(
        () => assertColumnIdentifier('id'),
        TypeError,
        'must start with $',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier(123),
        TypeError,
        'must start with $',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier(null),
        TypeError,
        'must start with $',
      );
    });

    await b.step('should validate nested column identifiers', () => {
      // Should pass
      assertColumnIdentifier('$user.$name');
      assertColumnIdentifier('$table.$column');

      // Should fail
      asserts.assertThrows(
        () => assertColumnIdentifier('$foo.$bar.$baz'),
        TypeError,
        'Invalid ColumnIdentifier syntax.',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('$foo.bar'),
        TypeError,
        'must start with $',
      );
    });

    await b.step('should validate against invalid inputs', () => {
      // Should fail for various invalid inputs
      asserts.assertThrows(
        () => assertColumnIdentifier(''),
        TypeError,
        'must start with $',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier({}),
        TypeError,
        'must start with $',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier([]),
        TypeError,
        'must start with $',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('$'),
        TypeError,
        'Invalid ColumnIdentifier',
      );

      asserts.assertThrows(
        () => assertColumnIdentifier('$.'),
        TypeError,
        'Invalid ColumnIdentifier',
      );
    });
  });
});
