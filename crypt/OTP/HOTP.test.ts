import * as asserts from '$asserts';
import { type DigestAlgorithms, generateHOTP, verifyHOTP } from './mod.ts';

Deno.test('crypt.HOTP', async (t) => {
  await t.step('HOTP - Check if the length is as specified', async () => {
    for (let i = 6; i <= 40; i++) {
      asserts.assertEquals(
        (await generateHOTP('12345678901234567890', 1, { length: i })).length,
        i,
      );
    }
  });

  await t.step(
    'HOTP - Verify implementation against known values',
    async () => {
      // RFC 4226 Test vectors with key "12345678901234567890"
      const key = '12345678901234567890';
      const results: Record<string, string> = {
        '0': '755224',
        '1': '287082',
        '2': '359152',
        '3': '969429',
        '4': '338314',
        '5': '254676',
        '6': '287922',
        '7': '162583',
        '8': '399871',
        '9': '520489',
      };

      for (const [k, v] of Object.entries(results)) {
        const result = await generateHOTP(key, parseInt(k), {
          length: 6,
          algo: 'SHA-1',
        });
        asserts.assertEquals(result, v);
      }
    },
  );

  await t.step('HOTP - Different Digest Algorithms', async () => {
    const key = '12345678901234567890123456789012';
    const counter = 1;
    const algorithms: DigestAlgorithms[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const hotp = await generateHOTP(key, counter, { length: 8, algo });
      asserts.assertEquals(typeof hotp, 'string');
      asserts.assertEquals(hotp.length, 8);
      asserts.assert(/^\d+$/.test(hotp), 'Should contain only digits');
    }
  });

  await t.step('HOTP - Error Handling', async () => {
    await asserts.assertRejects(
      () => generateHOTP('short', 1),
      Error,
      'Secret key should be at least 16 characters long',
    );

    await asserts.assertRejects(
      () => generateHOTP('12345678901234567890', -1),
      Error,
      'Counter must be a non-negative integer',
    );

    await asserts.assertRejects(
      () => generateHOTP('12345678901234567890', 1, { length: 0 }),
      Error,
      'OTP length must be a non-negative integer',
    );
  });

  await t.step('HOTP - Sequential Counters', async () => {
    const key = '12345678901234567890';
    const hotps: string[] = [];

    for (let i = 0; i < 5; i++) {
      const hotp = await generateHOTP(key, i);
      asserts.assertEquals(typeof hotp, 'string');
      asserts.assertEquals(hotp.length, 6);
      hotps.push(hotp);
    }

    // All HOTPs should be different
    const uniqueHotps = new Set(hotps);
    asserts.assertEquals(uniqueHotps.size, hotps.length);
  });

  await t.step('HOTP - Consistency', async () => {
    const key = '12345678901234567890';
    const counter = 42;

    const hotp1 = await generateHOTP(key, counter);
    const hotp2 = await generateHOTP(key, counter);

    asserts.assertEquals(hotp1, hotp2);
  });

  await t.step('HOTP - Default Parameters', async () => {
    const key = '12345678901234567890';
    const counter = 1;

    const hotp = await generateHOTP(key, counter);
    asserts.assertEquals(typeof hotp, 'string');
    asserts.assertEquals(hotp.length, 6); // Default length
  });

  await t.step('HOTP - Large Counter Values', async () => {
    const key = '12345678901234567890';
    const largeCounter = 999999999;

    const hotp = await generateHOTP(key, largeCounter);
    asserts.assertEquals(typeof hotp, 'string');
    asserts.assertEquals(hotp.length, 6);
  });

  await t.step('verifyHOTP - Valid OTPs', async () => {
    const key = '12345678901234567890';
    const counter = 1;

    const hotp = await generateHOTP(key, counter);
    const isValid = await verifyHOTP(hotp, key, counter);

    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHOTP - Invalid OTPs', async () => {
    const key = '12345678901234567890';
    const counter = 1;

    const isValid = await verifyHOTP('000000', key, counter);
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHOTP - Wrong Counter', async () => {
    const key = '12345678901234567890';
    const counter = 1;

    const hotp = await generateHOTP(key, counter);
    const isValid = await verifyHOTP(hotp, key, counter + 1);

    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHOTP - Error Handling', async () => {
    const key = '12345678901234567890';

    await asserts.assertRejects(
      () => verifyHOTP('123456', 'short', 1),
      Error,
      'Secret key should be at least 16 characters long',
    );

    await asserts.assertRejects(
      () => verifyHOTP('123456', key, -1),
      Error,
      'Counter must be a non-negative integer',
    );

    // Invalid OTP format
    const isValid1 = await verifyHOTP('12a456', key, 1);
    asserts.assertEquals(isValid1, false);

    // Wrong length
    const isValid2 = await verifyHOTP('12345', key, 1);
    asserts.assertEquals(isValid2, false);
  });

  await t.step('verifyHOTP - All Algorithms', async () => {
    const algorithms: DigestAlgorithms[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];
    const key = '12345678901234567890123456789012';
    const counter = 1;

    for (const algo of algorithms) {
      const hotp = await generateHOTP(key, counter, { algo });
      const isValid = await verifyHOTP(hotp, key, counter, { algo });
      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyHOTP - Different OTP Lengths', async () => {
    const key = '12345678901234567890';
    const counter = 1;
    const lengths = [6, 7, 8, 9, 10];

    for (const length of lengths) {
      const hotp = await generateHOTP(key, counter, { length });
      const isValid = await verifyHOTP(hotp, key, counter, { length });
      asserts.assertEquals(isValid, true);
    }
  });
});
