import { bigintGuard } from '../mod.ts';

import { assertEquals, assertThrows } from '../../dev.dependencies.ts';

Deno.test({
  name: `[library='Guardian' method='BigInt'] Basic bigint validation`,
}, () => {
  assertEquals(bigintGuard(12312323423545345n), 12312323423545345n);
});

Deno.test({
  name:
    `[library='Guardian' method='BigInt.min'] BigInt minimum value validation`,
}, () => {
  assertEquals(
    bigintGuard.min(12312323423545345n)(12312323423545345n),
    12312323423545345n,
  );
});

Deno.test({
  name:
    `[library='Guardian' method='BigInt.max'] BigInt maximum value validation`,
}, () => {
  assertEquals(
    bigintGuard.max(12312323423545345n)(12312323423545345n),
    12312323423545345n,
  );
});

Deno.test({
  name:
    `[library='Guardian' method='BigInt.between'] BigInt between value validation`,
  fn: () => {
    const validator = bigintGuard.between(
      10n,
      20n,
      'Expect number to be between 10 and 20',
    );

    assertEquals(validator.validate(15n), [undefined, 15n]);
    assertThrows(() => validator(5n), 'Expect number to be between 10 and 20');
    assertThrows(() => validator(25n), 'Expect number to be between 10 and 20');
  },
});

Deno.test({
  name:
    `[library='Guardian' method='BigInt.pattern'] BigInt pattern validation`,
  fn: () => {
    const validator = bigintGuard.pattern(/^\d+$/);

    assertEquals(validator.validate(123n), [undefined, 123n]);
    assertEquals(validator.validate(456789n), [undefined, 456789n]);
    assertThrows(
      () => validator(-789n),
      'Expected value to match pattern /^\\d+$/',
    );
  },
});
