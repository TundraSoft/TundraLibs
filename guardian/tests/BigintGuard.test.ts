import { bigintGuard } from '../mod.ts';

import { assertEquals } from '/root/dev.dependencies.ts';

Deno.test({
  name: 'Bigint - Test basic string validation',
  fn(): void {
    assertEquals(bigintGuard(12312323423545345n), 12312323423545345n);
    assertEquals(
      bigintGuard.min(12312323423545345n)(12312323423545345n),
      12312323423545345n,
    );
  },
});
