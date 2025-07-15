import * as asserts from '$asserts';
import {
  type DigestAlgorithms,
  HOTP,
  TOTP,
  verifyHOTP,
  verifyTOTP,
} from './mod.ts';

Deno.test('crypt.OTP', async (t) => {
  await t.step('TOTP', async (h) => {
    await h.step('Check if the length is as specified', async () => {
      for (let i = 6; i <= 40; i++) {
        asserts.assertEquals(
          (await TOTP('12345678901234567890', Date.now(), 30, i)).length,
          i,
        );
      }
    });

    await h.step('verify OTP implementation against known values', async () => {
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
            await TOTP(
              key,
              parseInt(k),
              30,
              length,
              algo as DigestAlgorithms,
            ),
            v,
          );
        }
      }
    });

    await h.step('must throw on invalid params', () => {
      asserts.assertRejects(
        () => TOTP('dfdfsd', Date.now(), 30, 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 characters long',
      );
      asserts.assertRejects(
        () => TOTP('12345678901234567890', -1, 30, 6, 'SHA-1'),
        Error,
        'Counter must be a non-negative integer',
      );
      asserts.assertRejects(
        () => TOTP('12345678901234567890', Date.now(), 30, -1, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );
      asserts.assertRejects(
        () =>
          TOTP(
            '12345678901234567890',
            Date.now(),
            30,
            6,
            'AAA-256' as DigestAlgorithms,
          ),
        Error,
        'The provided algorithm name is not supported',
      );
    });

    await h.step('verifyTOTP - validate correct OTPs', async () => {
      const key = '12345678901234567890';
      const time = 59000; // Known test time
      const expectedTOTP = '287082'; // Known correct value

      // Generate TOTP for reference
      const totp = await TOTP(key, time, 30, 6, 'SHA-1');
      asserts.assertEquals(totp, expectedTOTP);

      // Verify the generated TOTP
      const isValid = await verifyTOTP(totp, key, 1, time, 30, 6, 'SHA-1');
      asserts.assertEquals(isValid, true);
    });

    await h.step('verifyTOTP - reject incorrect OTPs', async () => {
      const key = '12345678901234567890';
      const time = 59000;

      // Test with incorrect OTP
      const isValid = await verifyTOTP('111111', key, 1, time, 30, 6, 'SHA-1');
      asserts.assertEquals(isValid, false);
    });

    await h.step('verifyTOTP - validate within time window', async () => {
      const key = '12345678901234567890';
      const currentTime = 1111111109000; // Base time
      const validOTP = await TOTP(key, currentTime, 30, 6, 'SHA-1');

      // Test time window +/- 1 period
      const futureTime = currentTime + 30 * 1000; // 30 seconds later
      const pastTime = currentTime - 30 * 1000; // 30 seconds earlier

      // OTP should be valid within the time window (window=1)
      asserts.assertEquals(
        await verifyTOTP(validOTP, key, 1, futureTime, 30, 6, 'SHA-1'),
        true,
      );
      asserts.assertEquals(
        await verifyTOTP(validOTP, key, 1, pastTime, 30, 6, 'SHA-1'),
        true,
      );

      // OTP should be invalid outside the time window
      const farFutureTime = currentTime + 2 * 30 * 1000; // 60 seconds later
      const farPastTime = currentTime - 2 * 30 * 1000; // 60 seconds earlier

      asserts.assertEquals(
        await verifyTOTP(validOTP, key, 1, farFutureTime, 30, 6, 'SHA-1'),
        false,
      );
      asserts.assertEquals(
        await verifyTOTP(validOTP, key, 1, farPastTime, 30, 6, 'SHA-1'),
        false,
      );
    });

    await h.step('verifyTOTP - support binary key input', async () => {
      const textKey = '12345678901234567890';
      const binaryKey = new TextEncoder().encode(textKey);
      const time = 59000;

      // Generate OTPs with both key formats
      const textKeyOTP = await TOTP(textKey, time, 30, 6, 'SHA-1');
      const binaryKeyOTP = await TOTP(binaryKey, time, 30, 6, 'SHA-1');

      // OTPs should match
      asserts.assertEquals(textKeyOTP, binaryKeyOTP);

      // Verify with binary key
      asserts.assertEquals(
        await verifyTOTP(textKeyOTP, binaryKey, 1, time, 30, 6, 'SHA-1'),
        true,
      );
    });

    await h.step('explicitly test invalid period parameter', () => {
      asserts.assertThrows(
        () => TOTP('12345678901234567890', Date.now(), 0, 6, 'SHA-1'),
        Error,
        'Time period must be at least 1 second',
      );
    });

    await h.step('test default parameters', async () => {
      // Test that TOTP works with default parameters
      const key = '12345678901234567890';
      const timestamp = 59000;

      // Default params: epoch = Date.now(), period = 30, length = 6, algo = 'SHA-256'
      const fullParamsOTP = await TOTP(key, timestamp, 30, 6, 'SHA-256');

      // Test omitting algorithm
      const noAlgoOTP = await TOTP(key, timestamp, 30, 6);
      asserts.assertEquals(noAlgoOTP, fullParamsOTP);

      // Test omitting length
      const noLengthOTP = await TOTP(key, timestamp, 30);
      asserts.assertEquals(noLengthOTP.length, 6);

      // Test omitting period
      const noPeriodOTP = await TOTP(key);
      asserts.assertEquals(noPeriodOTP.length, 6);
    });

    await h.step('verifyTOTP - reject OTP with wrong length', async () => {
      const key = '12345678901234567890';
      const time = 59000;

      // Test with incorrect OTP length
      const isValid = await verifyTOTP('1234', key, 1, time, 30, 6, 'SHA-1');
      asserts.assertEquals(isValid, false);
    });

    // await h.step('verifyTOTP - reject non-numeric OTP', async () => {
    //   const key = '12345678901234567890';
    //   const time = 59000;

    //   // Test with non-numeric OTP
    //   const isValid = await verifyTOTP('abcdef', key, 1, time, 30, 6, 'SHA-1');
    //   asserts.assertEquals(isValid, false);
    // });

    await h.step('test binary key validation - short binary key', async () => {
      const shortBinaryKey = new Uint8Array([1, 2, 3, 4, 5]); // < 16 bytes

      await asserts.assertRejects(
        () => TOTP(shortBinaryKey, Date.now(), 30, 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 bytes long',
      );
    });

    await h.step(
      'test verifyTOTP with negative counter in time window',
      async () => {
        const key = '12345678901234567890';
        const earlyTime = 15000; // 15 seconds (half a period)
        const validOTP = await TOTP(key, earlyTime, 30, 6, 'SHA-1');

        // Test with a window that would create negative counter values
        // Counter at earlyTime would be 0, so window=2 would check counter -2, -1, 0, 1, 2
        const isValid = await verifyTOTP(
          validOTP,
          key,
          2,
          earlyTime,
          30,
          6,
          'SHA-1',
        );
        asserts.assertEquals(isValid, true);
      },
    );

    await h.step('test verifyTOTP with empty/invalid OTP strings', async () => {
      const key = '12345678901234567890';
      const time = 59000;

      // Empty OTP
      const emptyResult = await verifyTOTP('', key, 1, time, 30, 6, 'SHA-1');
      asserts.assertEquals(emptyResult, false);

      // Non-numeric OTP
      const nonNumericResult = await verifyTOTP(
        'abcdef',
        key,
        1,
        time,
        30,
        6,
        'SHA-1',
      );
      asserts.assertEquals(nonNumericResult, false);

      // Wrong length OTP
      const wrongLengthResult = await verifyTOTP(
        '12345',
        key,
        1,
        time,
        30,
        6,
        'SHA-1',
      );
      asserts.assertEquals(wrongLengthResult, false);
    });

    await h.step('test verifyTOTP with floating point window', async () => {
      const key = '12345678901234567890';
      const time = 59000;

      await asserts.assertRejects(
        () => verifyTOTP('123456', key, 1.5, time, 30, 6, 'SHA-1'),
        Error,
        'Window must be a non-negative integer',
      );
    });

    await h.step('test TOTP time counter edge cases', async () => {
      const key = '12345678901234567890';

      // Test at exact time boundaries
      const exactTime = 30000; // Exactly 30 seconds (1 time step)
      const otp1 = await TOTP(key, exactTime - 1, 30, 6, 'SHA-1'); // 29.999 seconds
      const otp2 = await TOTP(key, exactTime, 30, 6, 'SHA-1'); // 30.000 seconds

      // These should be different time steps
      asserts.assertNotEquals(otp1, otp2);
    });

    await h.step('test TOTP error handling in generate function', async () => {
      // Test period less than 1
      asserts.assertThrows(
        () => TOTP('12345678901234567890', Date.now(), 0.5, 6, 'SHA-1'),
        Error,
        'Time period must be at least 1 second',
      );

      // Test floating point length - this will be caught by the generate function
      await asserts.assertRejects(
        () => TOTP('12345678901234567890', Date.now(), 30, 6.5, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );

      // Test zero length - this will be caught by the generate function
      await asserts.assertRejects(
        () => TOTP('12345678901234567890', Date.now(), 30, 0, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );
    });
  });

  await t.step('HOTP', async (h) => {
    await h.step('Check if the length is as specified', async () => {
      for (let i = 6; i <= 40; i++) {
        asserts.assertEquals(
          (await HOTP('12345678901234567890', 0, i)).length,
          i,
        );
      }
    });

    await h.step('verify OTP implementation against known values', async () => {
      const key = '12345678901234567890',
        results: Record<string, string> = {
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
        asserts.assertEquals(await HOTP(key, parseInt(k), 6, 'SHA-1'), v);
      }
    });

    await h.step('verify generation of HOTP in different digest', async () => {
      asserts.assertEquals(
        await HOTP('12345678901234567890', 0, 6, 'SHA-1'),
        '755224',
      );
      asserts.assertEquals(
        await HOTP('12345678901234567890', 0, 6, 'SHA-256'),
        '875740',
      );
      asserts.assertEquals(
        await HOTP('12345678901234567890', 0, 6, 'SHA-384'),
        '502125',
      );
      asserts.assertEquals(
        await HOTP('12345678901234567890', 0, 6, 'SHA-512'),
        '125165',
      );
    });

    await h.step('must throw on invalid params', () => {
      asserts.assertRejects(
        () => HOTP('dfdfsd', Date.now(), 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 characters long',
      );
      asserts.assertRejects(
        () => HOTP('12345678901234567890', -1, 6, 'SHA-1'),
        Error,
        'Counter must be a non-negative integer',
      );
      asserts.assertRejects(
        () => HOTP('12345678901234567890', Date.now(), -1, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );
      asserts.assertRejects(
        () =>
          HOTP(
            '12345678901234567890',
            Date.now(),
            6,
            'AAA-256' as DigestAlgorithms,
          ),
        Error,
        'The provided algorithm name is not supported',
      );
    });

    await h.step('verifyHOTP - validate correct OTPs', async () => {
      const key = '12345678901234567890';
      const counter = 0;
      const expectedHOTP = '755224'; // Known correct value

      // Generate HOTP for reference
      const hotp = await HOTP(key, counter, 6, 'SHA-1');
      asserts.assertEquals(hotp, expectedHOTP);

      // Verify the generated HOTP
      const isValid = await verifyHOTP(hotp, key, counter, 6, 'SHA-1');
      asserts.assertEquals(isValid, true);
    });

    await h.step('verifyHOTP - reject incorrect OTPs', async () => {
      const key = '12345678901234567890';
      const counter = 0;

      // Test with incorrect OTP
      const isValid = await verifyHOTP('111111', key, counter, 6, 'SHA-1');
      asserts.assertEquals(isValid, false);
    });

    await h.step('verifyHOTP - support binary key input', async () => {
      const textKey = '12345678901234567890';
      const binaryKey = new TextEncoder().encode(textKey);
      const counter = 0;

      // Generate OTPs with both key formats
      const textKeyOTP = await HOTP(textKey, counter, 6, 'SHA-1');
      const binaryKeyOTP = await HOTP(binaryKey, counter, 6, 'SHA-1');

      // OTPs should match
      asserts.assertEquals(textKeyOTP, binaryKeyOTP);

      // Verify with binary key
      asserts.assertEquals(
        await verifyHOTP(textKeyOTP, binaryKey, counter, 6, 'SHA-1'),
        true,
      );
    });

    await h.step('test default parameters', async () => {
      // Test that HOTP works with default parameters
      const key = '12345678901234567890';
      const counter = 0;

      // Default params: length = 6, algo = 'SHA-256'
      const fullParamsOTP = await HOTP(key, counter, 6, 'SHA-256');

      // Test omitting algorithm
      const noAlgoOTP = await HOTP(key, counter, 6);
      asserts.assertEquals(noAlgoOTP, fullParamsOTP);

      // Test omitting length
      const noLengthOTP = await HOTP(key, counter);
      asserts.assertEquals(noLengthOTP.length, 6);
    });

    await h.step('test with large counter value', async () => {
      const key = '12345678901234567890';
      const largeCounter = 2147483647; // Max 32-bit signed integer

      // Ensure large counter works
      const otp = await HOTP(key, largeCounter, 6, 'SHA-1');
      asserts.assertEquals(otp.length, 6);
      asserts.assertEquals(/^\d{6}$/.test(otp), true);

      // Verify the OTP is valid
      const isValid = await verifyHOTP(otp, key, largeCounter, 6, 'SHA-1');
      asserts.assertEquals(isValid, true);
    });

    await h.step('verifyHOTP - reject OTP with wrong length', async () => {
      const key = '12345678901234567890';
      const counter = 0;

      // Test with incorrect OTP length
      const isValid = await verifyHOTP('1234', key, counter, 6, 'SHA-1');
      asserts.assertEquals(isValid, false);
    });

    await h.step('verifyHOTP - reject non-numeric OTP', async () => {
      const key = '12345678901234567890';
      const counter = 0;

      // Test with non-numeric OTP
      const isValid = await verifyHOTP('abcdef', key, counter, 6, 'SHA-1');
      asserts.assertEquals(isValid, false);
    });

    await h.step('must throw on invalid params for verify functions', () => {
      const key = '12345678901234567890';

      asserts.assertRejects(
        () => verifyTOTP('123456', 'short', 1, Date.now(), 30, 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 characters long',
      );

      asserts.assertRejects(
        () => verifyTOTP('123456', key, -1, Date.now(), 30, 6, 'SHA-1'),
        Error,
        'Window must be a non-negative integer',
      );

      asserts.assertRejects(
        () => verifyTOTP('123456', key, 1, Date.now(), 0, 6, 'SHA-1'),
        Error,
        'Time period must be at least 1 second',
      );

      asserts.assertRejects(
        () => verifyHOTP('123456', 'short', 0, 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 characters long',
      );

      asserts.assertRejects(
        () => verifyHOTP('123456', key, -1, 6, 'SHA-1'),
        Error,
        'Counter must be a non-negative integer',
      );
    });

    await h.step('test binary key validation - short binary key', async () => {
      const shortBinaryKey = new Uint8Array([1, 2, 3, 4, 5]); // < 16 bytes

      await asserts.assertRejects(
        () => HOTP(shortBinaryKey, 0, 6, 'SHA-1'),
        Error,
        'Secret key should be at least 16 bytes long',
      );
    });

    await h.step('test verifyHOTP with empty/invalid OTP strings', async () => {
      const key = '12345678901234567890';
      const counter = 0;

      // Empty OTP
      const emptyResult = await verifyHOTP('', key, counter, 6, 'SHA-1');
      asserts.assertEquals(emptyResult, false);

      // Non-numeric OTP
      const nonNumericResult = await verifyHOTP(
        'abcdef',
        key,
        counter,
        6,
        'SHA-1',
      );
      asserts.assertEquals(nonNumericResult, false);

      // Wrong length OTP
      const wrongLengthResult = await verifyHOTP(
        '12345',
        key,
        counter,
        6,
        'SHA-1',
      );
      asserts.assertEquals(wrongLengthResult, false);
    });

    await h.step('test HOTP error handling in generate function', async () => {
      // Test floating point counter
      await asserts.assertRejects(
        () => HOTP('12345678901234567890', 1.5, 6, 'SHA-1'),
        Error,
        'Counter must be a non-negative integer',
      );

      // Test floating point length
      await asserts.assertRejects(
        () => HOTP('12345678901234567890', 0, 6.5, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );

      // Test zero length
      await asserts.assertRejects(
        () => HOTP('12345678901234567890', 0, 0, 'SHA-1'),
        Error,
        'OTP length must be a non-negative integer',
      );
    });

    await h.step('test crypto error handling paths', async () => {
      // Test with a mock scenario that might cause crypto errors
      // This is tricky to test directly, but we can test with unusual inputs
      const key = '12345678901234567890';

      // Test with very large counter that might cause issues
      const veryLargeCounter = Number.MAX_SAFE_INTEGER;
      const otp = await HOTP(key, veryLargeCounter, 6, 'SHA-1');
      asserts.assertEquals(otp.length, 6);
      asserts.assertEquals(/^\d{6}$/.test(otp), true);
    });

    await h.step('test dynamic truncation edge cases', async () => {
      // Test that the dynamic truncation algorithm works correctly
      // by testing with known inputs that exercise different offset values
      const key = 'test1234567890123456'; // Different key to get different hash patterns
      const counter = 12345;

      const otp = await HOTP(key, counter, 8, 'SHA-256');
      asserts.assertEquals(otp.length, 8);
      asserts.assertEquals(/^\d{8}$/.test(otp), true);

      // Verify the same OTP is generated consistently
      const otp2 = await HOTP(key, counter, 8, 'SHA-256');
      asserts.assertEquals(otp, otp2);
    });

    await h.step(
      'test HOTP generation with various algorithms and edge lengths',
      async () => {
        const key = '12345678901234567890';
        const counter = 0;

        // Test minimum length
        const minOtp = await HOTP(key, counter, 1, 'SHA-1');
        asserts.assertEquals(minOtp.length, 1);
        asserts.assertEquals(/^\d$/.test(minOtp), true);

        // Test maximum reasonable length
        const maxOtp = await HOTP(key, counter, 10, 'SHA-512');
        asserts.assertEquals(maxOtp.length, 10);
        asserts.assertEquals(/^\d{10}$/.test(maxOtp), true);
      },
    );
  });
});
