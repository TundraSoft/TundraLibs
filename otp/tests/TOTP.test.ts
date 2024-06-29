import { TOTP } from '../mod.ts';
import { assertEquals } from '../../dev.dependencies.ts';

Deno.test('OTP:TOTP', async (t) => {
  await t.step('SHA-1', async (t) => {
    await t.step(
      'Length of generated OTP must match specified length',
      async () => {
        // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
        const lengths = [4, 6, 8, 10, 12];
        for (let i = 0; i < 100; i++) {
          const otps = await Promise.all(lengths.map(async (length) => {
            return await TOTP('12345678901234567890', 'SHA-1', length, 30);
          }));
          otps.forEach((otp, index) => {
            assertEquals(otp.length, lengths[index]);
          });
        }
      },
    );

    await t.step(
      'Generated OTP must be unique for the same secret and time',
      async () => {
        const iter = 30;
        const otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-1', 6, 1)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, iter);
      },
    );

    await t.step(
      'OTP must be the same when generated within same time + interval',
      async () => {
        const iter = 5,
          epoc = Date.now(),
          otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-1', 6, 1, epoc)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, 1);
      },
    );
  });

  await t.step('SHA-256', async (t) => {
    await t.step(
      'Length of generated OTP must match specified length',
      async () => {
        // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
        const lengths = [4, 6, 8, 10, 12];
        for (let i = 0; i < 100; i++) {
          const otps = await Promise.all(lengths.map(async (length) => {
            return await TOTP('12345678901234567890', 'SHA-256', length, 30);
          }));
          otps.forEach((otp, index) => {
            assertEquals(otp.length, lengths[index]);
          });
        }
      },
    );

    await t.step(
      'Generated OTP must be unique for the same secret and time',
      async () => {
        const iter = 30;
        const otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-256', 6, 1)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, iter);
      },
    );

    await t.step(
      'OTP must be the same when generated within same time + interval',
      async () => {
        const iter = 5,
          epoc = Date.now(),
          otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-256', 6, 1, epoc)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, 1);
      },
    );
  });

  await t.step('SHA-384', async (t) => {
    await t.step(
      'Length of generated OTP must match specified length',
      async () => {
        // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
        const lengths = [4, 6, 8, 10, 12];
        for (let i = 0; i < 100; i++) {
          const otps = await Promise.all(lengths.map(async (length) => {
            return await TOTP('12345678901234567890', 'SHA-384', length, 30);
          }));
          otps.forEach((otp, index) => {
            assertEquals(otp.length, lengths[index]);
          });
        }
      },
    );

    await t.step(
      'Generated OTP must be unique for the same secret and time',
      async () => {
        const iter = 5;
        const otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-384', 6, 1)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, iter);
      },
    );

    await t.step(
      'OTP must be the same when generated within same time + interval',
      async () => {
        const iter = 5,
          epoc = Date.now(),
          otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-384', 6, 1, epoc)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, 1);
      },
    );
  });

  await t.step('SHA-512', async (t) => {
    await t.step(
      'Length of generated OTP must match specified length',
      async () => {
        // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
        const lengths = [4, 6, 8, 10, 12];
        for (let i = 0; i < 100; i++) {
          const otps = await Promise.all(lengths.map(async (length) => {
            return await TOTP('12345678901234567890', 'SHA-512', length, 30);
          }));
          otps.forEach((otp, index) => {
            assertEquals(otp.length, lengths[index]);
          });
        }
      },
    );

    await t.step(
      'Generated OTP must be unique for the same secret and time',
      async () => {
        const iter = 5;
        const otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-512', 6, 1)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, iter);
      },
    );

    await t.step(
      'OTP must be the same when generated within same time + interval',
      async () => {
        const iter = 5,
          epoc = Date.now(),
          otps = new Set<string>();
        for (let i = 0; i < iter; i++) {
          otps.add(await TOTP('12345678901234567890', 'SHA-512', 6, 1, epoc)); // Set window as 0
          // Wait for next tick
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assertEquals(otps.size, 1);
      },
    );

    await t.step('RFC-6238 Specification Test Vectors - SHA-1', async () => {
      const data = {
        59000: '287082',
        1111111109000: '081804',
        1111111111000: '050471',
        1234567890000: '005924',
        2000000000000: '279037',
        20000000000000: '353130',
      };
      await Object.entries(data).forEach(async ([key, value]) => {
        assertEquals(
          await TOTP('12345678901234567890', 'SHA-1', 6, 30, Number(key)),
          value,
        );
      });
    });

    await t.step('RFC-6238 Specification Test Vectors - SHA-256', async () => {
      const data = {
        59000: '46119246',
        1111111109000: '68084774',
        1111111111000: '67062674',
        1234567890000: '91819424',
        2000000000000: '90698825',
        20000000000000: '77737706',
      };
      await Object.entries(data).forEach(async ([key, value]) => {
        assertEquals(
          await TOTP(
            '12345678901234567890123456789012',
            'SHA-256',
            8,
            30,
            Number(key),
          ),
          value,
        );
      });
    });

    await t.step('RFC-6238 Specification Test Vectors - SHA-512', async () => {
      const data = {
        59000: '90693936',
        1111111109000: '25091201',
        1111111111000: '99943326',
        1234567890000: '93441116',
        2000000000000: '38618901',
        20000000000000: '47863826',
      };
      await Object.entries(data).forEach(async ([key, value]) => {
        assertEquals(
          await TOTP(
            '1234567890123456789012345678901234567890123456789012345678901234',
            'SHA-512',
            8,
            30,
            Number(key),
          ),
          value,
        );
      });
    });
  });
});
