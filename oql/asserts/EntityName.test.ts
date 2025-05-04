import * as asserts from '$asserts';
import { assertEntityName } from './EntityName.ts';

Deno.test('OQL.asserts.EntityName', async (a) => {
  await a.step('EntityName', async (b) => {
    await b.step('should validate proper entity names', () => {
      // Should pass
      assertEntityName('valid');
      assertEntityName('name123');
      assertEntityName('user_name');
      assertEntityName('userName');
      assertEntityName('a');
      assertEntityName('_internal');

      // Should fail
      asserts.assertThrows(
        () => assertEntityName(''),
        TypeError,
        'Entity name cannot be empty',
      );

      asserts.assertThrows(
        () => assertEntityName('invalid$char'),
        TypeError,
        'Entity name contains invalid characters',
      );
    });

    await b.step('should validate against invalid inputs', () => {
      // Should fail for non-string inputs
      asserts.assertThrows(
        () => assertEntityName(123),
        TypeError,
        'Entity name must be a string',
      );

      asserts.assertThrows(
        () => assertEntityName(null),
        TypeError,
        'Entity name must be a string',
      );

      asserts.assertThrows(
        () => assertEntityName({}),
        TypeError,
        'Entity name must be a string',
      );

      asserts.assertThrows(
        () => assertEntityName([]),
        TypeError,
        'Entity name must be a string',
      );
    });

    await b.step('should validate against reserved words', () => {
      // Should fail for SQL reserved words
      asserts.assertThrows(
        () => assertEntityName('SELECT'),
        TypeError,
        'Entity name cannot be a reserved word',
      );

      asserts.assertThrows(
        () => assertEntityName('insert'),
        TypeError,
        'Entity name cannot be a reserved word',
      );

      asserts.assertThrows(
        () => assertEntityName('Delete'),
        TypeError,
        'Entity name cannot be a reserved word',
      );
    });
  });
});
