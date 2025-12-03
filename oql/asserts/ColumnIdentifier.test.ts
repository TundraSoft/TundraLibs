import * as asserts from '$asserts';
import { assertColumnIdentifier } from './ColumnIdentifier.ts';

Deno.test('dam.assets.ColumnIdentifier', async (t) => {
  await t.step('valid simple format', () => {
    assertColumnIdentifier('@id');
    assertColumnIdentifier('@name');
    assertColumnIdentifier('@email');
    assertColumnIdentifier('@createdAt');
    assertColumnIdentifier('@_private');
    assertColumnIdentifier('@field123');
  });

  await t.step('valid qualified format', () => {
    assertColumnIdentifier('@users.@id');
    assertColumnIdentifier('@Profile.@email');
    assertColumnIdentifier('@Order.@total');
    assertColumnIdentifier('@_table.@_column');
    assertColumnIdentifier('@table123.@column456');
  });

  await t.step('valid nested JSON paths', () => {
    assertColumnIdentifier('@users.@profile.@email');
    assertColumnIdentifier('@data.@settings.@theme');
    assertColumnIdentifier('@data.@settings.@theme.@dark');
    assertColumnIdentifier('@config.@a.@b.@c.@d.@e');
    assertColumnIdentifier('@table.@col.@json1.@json2.@json3');
  });

  await t.step('invalid: missing @ prefix', () => {
    asserts.assertThrows(
      () => assertColumnIdentifier('id'),
      TypeError,
      "Must start with '@'",
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('users.@id'),
      TypeError,
      "Must start with '@'",
    );
  });

  await t.step('invalid: segment missing @ prefix', () => {
    asserts.assertThrows(
      () => assertColumnIdentifier('@table.id'),
      TypeError,
      'Segment "id" must start with \'@\'',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.column'),
      TypeError,
      'Segment "column" must start with \'@\'',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@users.@profile.email'),
      TypeError,
      'Segment "email" must start with \'@\'',
    );
  });

  await t.step('invalid: empty segments', () => {
    asserts.assertThrows(
      () => assertColumnIdentifier('@'),
      TypeError,
      'has empty identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.@'),
      TypeError,
      'has empty identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@.@column'),
      TypeError,
      'has empty identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table..@column'),
      TypeError,
      'Empty segment found',
    );
  });

  await t.step('invalid: invalid identifier characters', () => {
    asserts.assertThrows(
      () => assertColumnIdentifier('@123invalid'),
      TypeError,
      'invalid identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.@123invalid'),
      TypeError,
      'invalid identifier',
    );

    // Invalid characters
    asserts.assertThrows(
      () => assertColumnIdentifier('@table-name'),
      TypeError,
      'invalid identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.@column-name'),
      TypeError,
      'invalid identifier',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.@col.@key-value'),
      TypeError,
      'invalid identifier',
    );
  });

  await t.step('custom error messages', () => {
    asserts.assertThrows(
      () => assertColumnIdentifier('invalid', 'Custom error message'),
      TypeError,
      'Custom error message',
    );

    asserts.assertThrows(
      () => assertColumnIdentifier('@table.id', 'My custom message'),
      TypeError,
      'My custom message',
    );
  });
});
