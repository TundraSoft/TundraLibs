import { GuardianError, stringGuard } from '../mod.ts';

import { assertEquals, assertThrows } from '/root/dev.dependencies.ts';

Deno.test({
  name: 'String - Test basic string validation',
  fn(): void {
    assertEquals(stringGuard.trim().between(3, 40)('Abhinav '), 'Abhinav');
    assertEquals(
      stringGuard.trim().between(3, 40).email()('testmail@gmail.com'),
      'testmail@gmail.com',
    );
    assertEquals(stringGuard(' asd sd asd asd '), ' asd sd asd asd ');
    assertEquals(stringGuard.optional()(), undefined);
    assertThrows(() => stringGuard.aadhaar()('123456789'), GuardianError);
  },
});

Deno.test({
  name: 'String - Check if correct error message is coming',
  fn(): void {
    assertThrows(
      () => stringGuard.aadhaar('Value is not a valid AADHAAR')('123456789'),
      GuardianError,
      'Value is not a valid AADHAAR',
    );
  },
});
