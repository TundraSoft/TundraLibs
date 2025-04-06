import * as asserts from '$asserts';
import {
  type DigestAlgorithms,
  HOTP,
  TOTP,
  verifyHOTP,
  verifyTOTP,
} from './mod.ts';

Deno.test('OTP', async (t) => {
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
        let length = 6;
        switch (algo) {
          case 'SHA-256':
            key = '12345678901234567890123456789012';
            length = 8;
            break;
          case 'SHA-384':
            key =
              '1234567890123456789012345678901234567890123456789012345678901234';
            length = 8;
            break;
          case 'SHA-512':
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
  });
});
