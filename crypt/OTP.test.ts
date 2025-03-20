import * as asserts from '$asserts';
import { type DigestAlgorithms, HOTP, TOTP } from './mod.ts';

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

    // await h.step(
    //   'ensure unique OTPs are generated once window has elapsed',
    //   async () => {
    //     const iter = 30;
    //     const otps = new Set<string>();
    //     for (let i = 0; i < iter; i++) {
    //       otps.add(
    //         await TOTP('12345678901234567890', Date.now(), 1, 6, 'SHA-1'),
    //       );
    //       await new Promise((resolve) => setTimeout(resolve, 1000));
    //     }
    //     asserts.assertEquals(otps.size, iter);
    //   },
    // );

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
  });
});
