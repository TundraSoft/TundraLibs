import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type DigestAlgorithms, generateTOTP, verifyTOTP } from './mod.ts';

describe('crypt.TOTP', () => {
  it('TOTP - Check if the length is as specified', async () => {
    for (let i = 6; i <= 40; i++) {
      asserts.assertEquals(
        (await generateTOTP('12345678901234567890', {
          epoch: Date.now(),
          period: 30,
          length: i,
        })).length,
        i,
      );
    }
  });

  it(
    'TOTP - Verify implementation against known values',
    async () => {
      const values: Record<DigestAlgorithms, Record<number, string>> = {
        'SHA-1': {
          59000: '287082',
          1111111109000: '081804',
          1111111111000: '050471',
          1234567890000: '005924',
          2000000000000: '279037',
          20000000000000: '353130',
        },
        'SHA-256': {
          59000: '46119246',
          1111111109000: '68084774',
          1111111111000: '67062674',
          1234567890000: '91819424',
          2000000000000: '90698825',
          20000000000000: '77737706',
        },
        'SHA-384': {
          59000: '03101971',
          1111111109000: '67322300',
          1111111111000: '75083366',
          1234567890000: '16696097',
          2000000000000: '01776484',
          20000000000000: '78055951',
        },
        'SHA-512': {
          59000: '90693936',
          1111111109000: '25091201',
          1111111111000: '99943326',
          1234567890000: '93441116',
          2000000000000: '38618901',
          20000000000000: '47863826',
        },
      };

      for (const [algo, results] of Object.entries(values)) {
        let key = '';
        let length;
        switch (algo) {
          case 'SHA-256':
            key = '12345678901234567890123456789012';
            length = 8;
            break;
          case 'SHA-512':
          case 'SHA-384':
            key =
              '1234567890123456789012345678901234567890123456789012345678901234';
            length = 8;
            break;
          default:
            key = '12345678901234567890';
            length = 6;
        }
        for (const [k, v] of Object.entries(results)) {
          asserts.assertEquals(
            await generateTOTP(
              key,
              {
                epoch: Number.parseInt(k),
                period: 30,
                length,
                algo: algo as DigestAlgorithms,
              },
            ),
            v,
          );
        }
      }
    },
  );

  it('TOTP - Error Handling', async () => {
    await asserts.assertRejects(
      () => generateTOTP('dfdfsd'),
      Error,
      'Secret key should be at least 16 characters long',
    );

    asserts.assertThrows(
      () => generateTOTP('12345678901234567890', { period: 0 }),
      Error,
      'Time period must be at least 1 second',
    );

    await asserts.assertRejects(
      () => generateTOTP('12345678901234567890', { length: 0 }),
      Error,
      'OTP length must be a non-negative integer',
    );
  });

  it('TOTP - Different Periods', async () => {
    const key = '12345678901234567890';
    const epoch = Date.now();

    const totp30 = await generateTOTP(key, { epoch, period: 30 });
    const totp60 = await generateTOTP(key, { epoch, period: 60 });

    // Different periods should generally produce different OTPs
    // (unless we're at a time boundary)
    asserts.assertEquals(typeof totp30, 'string');
    asserts.assertEquals(typeof totp60, 'string');
    asserts.assertEquals(totp30.length, 6);
    asserts.assertEquals(totp60.length, 6);
  });

  it('TOTP - Different Key Lengths', async () => {
    const epoch = Date.now();
    const keys = [
      '1234567890123456', // 16 chars
      '12345678901234567890', // 20 chars
      '123456789012345678901234567890', // 30 chars
    ];

    for (const key of keys) {
      const totp = await generateTOTP(key, { epoch, period: 30 });
      asserts.assertEquals(typeof totp, 'string');
      asserts.assertEquals(totp.length, 6);
    }
  });

  it('TOTP - Consistency', async () => {
    const key = '12345678901234567890';
    const epoch = Date.now();

    const totp1 = await generateTOTP(key, { epoch, period: 30 });
    const totp2 = await generateTOTP(key, { epoch, period: 30 });

    asserts.assertEquals(totp1, totp2);
  });

  it('TOTP - Default Parameters', async () => {
    const key = '12345678901234567890';

    const totp = await generateTOTP(key);
    asserts.assertEquals(typeof totp, 'string');
    asserts.assertEquals(totp.length, 6); // Default length
  });

  it('verifyTOTP - Valid OTPs', async () => {
    const key = '12345678901234567890';
    const epoch = Date.now();

    const totp = await generateTOTP(key, { epoch, period: 30 });
    const isValid = await verifyTOTP(totp, key, {
      window: 1,
      epoch,
      period: 30,
    });

    asserts.assertEquals(isValid, true);
  });

  it('verifyTOTP - Invalid OTPs', async () => {
    const key = '12345678901234567890';
    const epoch = Date.now();

    const isValid = await verifyTOTP('000000', key, {
      window: 1,
      epoch,
      period: 30,
    });
    asserts.assertEquals(isValid, false);
  });

  it('verifyTOTP - Time Window', async () => {
    const key = '12345678901234567890';
    const epoch = Date.now();

    const totp = await generateTOTP(key, { epoch, period: 30 });

    // Should be valid within window
    const isValidNow = await verifyTOTP(totp, key, {
      window: 1,
      epoch,
      period: 30,
    });
    asserts.assertEquals(isValidNow, true);

    // Should be valid in previous time step (within window)
    const isValidPrev = await verifyTOTP(totp, key, {
      window: 1,
      epoch: epoch - 30000,
      period: 30,
    });
    asserts.assertEquals(isValidPrev, true);
  });

  it('verifyTOTP - Error Handling', async () => {
    const key = '12345678901234567890';

    await asserts.assertRejects(
      () => verifyTOTP('123456', key, { epoch: Date.now(), period: 0 }),
      Error,
      'Time period must be at least 1 second',
    );

    await asserts.assertRejects(
      () =>
        verifyTOTP('123456', key, {
          window: -1,
          epoch: Date.now(),
          period: 30,
        }),
      Error,
      'Window must be a non-negative integer',
    );

    // Invalid OTP format
    const isValid1 = await verifyTOTP('12a456', key, {
      epoch: Date.now(),
      period: 30,
    });
    asserts.assertEquals(isValid1, false);

    // Wrong length
    const isValid2 = await verifyTOTP('12345', key, {
      epoch: Date.now(),
      period: 30,
    });
    asserts.assertEquals(isValid2, false);

    // Empty OTP
    const isValid3 = await verifyTOTP('', key, {
      epoch: Date.now(),
      period: 30,
    });
    asserts.assertEquals(isValid3, false);

    // Non-integer window (fractional)
    await asserts.assertRejects(
      () =>
        verifyTOTP('123456', key, {
          window: 1.5,
          epoch: Date.now(),
          period: 30,
        }),
      Error,
      'Window must be a non-negative integer',
    );
  });

  it('verifyTOTP - All Algorithms', async () => {
    const algorithms: DigestAlgorithms[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];
    const key = '12345678901234567890123456789012';
    const epoch = Date.now();

    for (const algo of algorithms) {
      const totp = await generateTOTP(key, { epoch, period: 30, algo });
      const isValid = await verifyTOTP(totp, key, {
        window: 1,
        epoch,
        period: 30,
        algo,
      });
      asserts.assertEquals(isValid, true);
    }
  });

  it('verifyTOTP - Counter edge cases', async () => {
    const key = '12345678901234567890';
    const epoch = 0; // Very early epoch

    // Generate OTP at epoch 0
    const otp = await generateTOTP(key, { epoch, period: 30 });

    // Should verify at the same time
    const isValid = await verifyTOTP(otp, key, {
      epoch,
      period: 30,
      window: 1,
    });
    asserts.assertEquals(isValid, true);

    // Test with large window that would result in negative counter
    // Counter = floor(epoch / (period * 1000)) = floor(0 / 30000) = 0
    // With window = 2, we check counters: -2, -1, 0, 1, 2
    // The code should skip negative counters (counter < 0)
    const isValid2 = await verifyTOTP(otp, key, {
      epoch: 0,
      period: 30,
      window: 2,
    });
    asserts.assertEquals(isValid2, true);
  });

  it('verifyTOTP - Null/undefined OTP', async () => {
    const key = '12345678901234567890';

    // Null OTP
    // @ts-expect-error: Testing invalid input
    const isValid1 = await verifyTOTP(null, key);
    asserts.assertEquals(isValid1, false);

    // Undefined OTP
    // @ts-expect-error: Testing invalid input
    const isValid2 = await verifyTOTP(undefined, key);
    asserts.assertEquals(isValid2, false);
  });

  it('TOTP - Base32 Secret Support', async () => {
    // Test with a Base32 encoded secret (as used by Google Authenticator)
    // Base32: JBSWY3DPEHPK3PXP decodes to "Hello!" in ASCII
    const base32Secret = 'JBSWY3DPEHPK3PXP';
    const rawSecret = 'Hello!0123456789'; // Regular UTF-8 string (16 chars minimum)

    // Both should generate valid OTPs
    const otp1 = await generateTOTP(base32Secret, {
      epoch: 59000,
      period: 30,
      algo: 'SHA-1',
      length: 6,
    });
    asserts.assertEquals(otp1.length, 6);
    asserts.assert(/^\d{6}$/.test(otp1));

    // Verify the OTP works
    const isValid = await verifyTOTP(otp1, base32Secret, {
      epoch: 59000,
      period: 30,
      algo: 'SHA-1',
      length: 6,
    });
    asserts.assertEquals(isValid, true);

    // Test with SHA-256 (common in modern implementations)
    const otp2 = await generateTOTP(
      'YL3J3FQSI6D2L4WSRQZKQ5TUWFY244KJSUO6KZWG7UA3XVAB5YFA',
      {
        epoch: Date.now(),
        period: 30,
        algo: 'SHA-256',
        length: 6,
      },
    );
    asserts.assertEquals(otp2.length, 6);
    asserts.assert(/^\d{6}$/.test(otp2));

    // Regular string (backwards compatibility)
    const otp3 = await generateTOTP(rawSecret, {
      epoch: 59000,
      period: 30,
      algo: 'SHA-1',
      length: 6,
    });
    asserts.assertEquals(otp3.length, 6);
    asserts.assert(/^\d{6}$/.test(otp3));
  });
});
