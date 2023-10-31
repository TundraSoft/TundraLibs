import { GuardianError, numberGuard } from '../mod.ts';

import { assertEquals, assertThrows } from '../../dev.dependencies.ts';

Deno.test({
  name: 'Number - Test basic string validation',
  fn(): void {
    assertEquals(numberGuard.integer()(123123), 123123);
    assertEquals(numberGuard.min(10)(15), 15);
    assertEquals(numberGuard.equals(10)(10), 10);
    assertEquals(numberGuard.optional()(), undefined);
    assertThrows(
      () => numberGuard.integer()(234233241234.123412341234),
      GuardianError,
    );
  },
});

Deno.test({
  name: 'Number - Check if correct error message is coming',
  fn(): void {
    assertThrows(
      () =>
        numberGuard.integer('Value is not a valid Integer')(123456789.234234),
      GuardianError,
      'Value is not a valid Integer',
    );
  },
});

Deno.test({
  name: 'Number - Transform to Date',
  fn(): void {
    const ts = 1661066144083,
      dt = new Date(ts);
    assertEquals(numberGuard.toDate()(ts), dt);
  },
});
