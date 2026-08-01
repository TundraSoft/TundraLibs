import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  type DigestAlgorithms,
  generateHOTP,
  generateOTPAuthURL,
  generateTOTP,
  verifyHOTP,
  verifyTOTP,
} from './mod.ts';

describe('crypt.OTP.generateOTPAuthURL', () => {
  it('Generate TOTP URL with default parameters', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });

    asserts.assertEquals(
      url,
      'otpauth://totp/MyApp:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('Generate TOTP URL with custom parameters', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'john.doe@example.com',
      issuer: 'GitHub',
      algorithm: 'SHA-256',
      digits: 8,
      period: 60,
    });

    asserts.assertEquals(
      url,
      'otpauth://totp/GitHub:john.doe%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA256&digits=8&period=60',
    );
  });

  it('Generate HOTP URL with default parameters', () => {
    const url = generateOTPAuthURL({
      type: 'hotp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });

    asserts.assertEquals(
      url,
      'otpauth://hotp/MyApp:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp&algorithm=SHA1&digits=6&counter=0',
    );
  });

  it('Generate HOTP URL with custom counter', () => {
    const url = generateOTPAuthURL({
      type: 'hotp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@example.com',
      issuer: 'MyApp',
      counter: 100,
    });

    asserts.assert(url.includes('counter=100'));
  });

  it('URL encodes special characters in account name', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user+test@example.com',
      issuer: 'My App',
    });

    asserts.assert(url.includes('My%20App:user%2Btest%40example.com'));
  });

  it('URL secret round-trips through the same TOTP engine (authenticator codes verify)', async () => {
    // Review regression: generateOTPAuthURL used to blindly uppercase + strip
    // spaces, but generate()/verifyTOTP decide base32-vs-UTF8 on the RAW secret
    // with a case-sensitive test. So a space-grouped lowercase secret is HMACed
    // as raw UTF-8 by the server, while an authenticator base32-decodes the
    // uppercased URL secret — two different keys, codes that never verify. The
    // URL secret must now encode the exact key bytes the engine uses.
    const secret = 'jbsw y3dp ehpk 3pxp';
    const epoch = 1700000000000;

    const url = generateOTPAuthURL({
      type: 'totp',
      secret,
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });
    const urlSecret = new URL(url).searchParams.get('secret')!;

    // The URL secret is authenticator-consumable base32 (RFC 4648 alphabet).
    asserts.assert(
      /^[A-Z2-7]+$/.test(urlSecret),
      `URL secret '${urlSecret}' must be base32`,
    );

    // Feeding the URL's base32 secret back through the engine (which
    // base32-decodes uppercase A-Z2-7) reproduces the server's own code — i.e.
    // the QR an authenticator scans derives the identical key.
    const serverCode = await generateTOTP(secret, { epoch });
    const authenticatorCode = await generateTOTP(urlSecret, { epoch });
    asserts.assertEquals(authenticatorCode, serverCode);
    asserts.assert(await verifyTOTP(authenticatorCode, secret, { epoch }));

    // An already-canonical base32 (uppercase, length a multiple of 8) secret is
    // byte-identical in the URL.
    const b32Url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'u',
      issuer: 'A',
    });
    asserts.assertEquals(
      new URL(b32Url).searchParams.get('secret'),
      'JBSWY3DPEHPK3PXP',
    );

    // A raw passphrase (valid input for generateTOTP) yields a base32 URL
    // secret that decodes to its UTF-8 bytes — the old code emitted the raw
    // non-base32 string most authenticator apps reject.
    const passphrase = '12345678901234567890';
    const passUrl = generateOTPAuthURL({
      type: 'totp',
      secret: passphrase,
      accountName: 'u',
      issuer: 'A',
    });
    const passUrlSecret = new URL(passUrl).searchParams.get('secret')!;
    asserts.assert(/^[A-Z2-7]+$/.test(passUrlSecret));
    asserts.assertEquals(
      await generateTOTP(passUrlSecret, { epoch }),
      await generateTOTP(passphrase, { epoch }),
    );
  });

  it('URL secret: an all-uppercase passphrase of a non-base32 length round-trips instead of throwing', async () => {
    // Round-4 regression guard. Routing the URL secret through secretToKeyBytes
    // base32-decodes ANY string matching /^[A-Z2-7]+=*$/. But matching the
    // alphabet is not the same as being a decodable base32 string: only lengths
    // whose remainder mod 8 is 0, 2, 4, 5 or 7 decode. An all-uppercase
    // passphrase whose length ≡ 1, 3 or 6 (mod 8) therefore made @std/encoding
    // throw a raw RangeError/TypeError — a dependency-level failure unlike every
    // other invalid parameter, which raises this function's own friendly
    // Error(). Such a secret must be treated as UTF-8 (as OTPAuthURLOptions.secret
    // documents) and yield a working URL whose base32 secret reproduces the OTP
    // engine's own codes.
    const epoch = 1700000000000;

    // These are >= 16 chars, so the OTP engine accepts them too — assert the
    // full authenticator round-trip.
    for (
      const secret of [
        'MYAPPSECRETKEYVALUE', // 19, %8 = 3  (was RangeError)
        'ABCDEFGHIJKLMNOPQRSTUV', // 22, %8 = 6  (was RangeError)
        'ABCDEFGHIJKLMNOPQ', // 17, %8 = 1  (was TypeError: Invalid character '=')
      ]
    ) {
      const url = generateOTPAuthURL({
        type: 'totp',
        secret,
        accountName: 'u',
        issuer: 'A',
      });
      const urlSecret = new URL(url).searchParams.get('secret')!;
      asserts.assert(
        /^[A-Z2-7]+$/.test(urlSecret),
        `URL secret '${urlSecret}' for '${secret}' must be base32`,
      );
      // The QR an authenticator scans derives the identical key the engine HMACs.
      asserts.assertEquals(
        await generateTOTP(urlSecret, { epoch }),
        await generateTOTP(secret, { epoch }),
      );
      asserts.assert(
        await verifyTOTP(
          await generateTOTP(secret, { epoch }),
          secret,
          { epoch },
        ),
      );
    }

    // Short base32-alphabet secrets used to produce a URL (generateOTPAuthURL
    // never applied the engine's 16-char floor); the fix must keep them working
    // rather than crash with a dependency error. (generateTOTP itself rejects
    // < 16 chars, so we only assert the URL builds and emits base32.)
    for (const secret of ['ABC', 'SECRET']) {
      const url = generateOTPAuthURL({
        type: 'totp',
        secret,
        accountName: 'u',
        issuer: 'A',
      });
      const urlSecret = new URL(url).searchParams.get('secret')!;
      asserts.assert(
        /^[A-Z2-7]+$/.test(urlSecret),
        `URL secret '${urlSecret}' for '${secret}' must be base32`,
      );
    }

    // Control: a genuine, canonical base32 secret still round-trips unchanged.
    const b32Url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'u',
      issuer: 'A',
    });
    asserts.assertEquals(
      new URL(b32Url).searchParams.get('secret'),
      'JBSWY3DPEHPK3PXP',
    );
  });

  it('URL secret: a NON-canonical base32 secret is normalised, not emitted verbatim', async () => {
    // Round-6 doc-accuracy guard. OTPAuthURLOptions.secret documents that only a
    // *canonical* base32 secret is byte-identical in the URL. A base32-alphabet
    // secret of a decodable length whose final character carries non-zero unused
    // trailing bits (remainder 2, 4, 5 or 7 mod 8) is decoded — dropping those
    // bits — and re-encoded to its canonical form, so its last character changes
    // even though it decodes to the same key. This pins that exact behaviour so
    // the JSDoc and Crypt-OTP.md stay honest.
    const epoch = 1700000000000;

    // The literal example from the docs: 'BASE32SECRET' (12 chars, remainder 4)
    // is decodable but non-canonical; it decodes to the same 7 bytes as
    // 'BASE32SECREQ', its canonical form, so the URL emits the latter. (It is
    // < 16 chars, so the OTP engine itself rejects it — assert the URL only.)
    asserts.assertEquals(
      new URL(
        generateOTPAuthURL({
          type: 'totp',
          secret: 'BASE32SECRET',
          accountName: 'u',
          issuer: 'A',
        }),
      ).searchParams.get('secret'),
      'BASE32SECREQ',
    );

    // A >= 16-char non-canonical secret the OTP engine also accepts, so we can
    // assert the full authenticator round-trip: 'MFRGGZDFMZTWQ2LKMYXW' (20 chars,
    // remainder 4) normalises to '...MYXQ' (last char W -> Q).
    const nonCanonical = 'MFRGGZDFMZTWQ2LKMYXW';
    const canonical = 'MFRGGZDFMZTWQ2LKMYXQ';
    const urlSecret = new URL(
      generateOTPAuthURL({
        type: 'totp',
        secret: nonCanonical,
        accountName: 'u',
        issuer: 'A',
      }),
    ).searchParams.get('secret')!;

    // The emitted secret is the canonical re-encoding, NOT the input verbatim.
    asserts.assertNotEquals(urlSecret, nonCanonical);
    asserts.assertEquals(urlSecret, canonical);
    asserts.assert(/^[A-Z2-7]+$/.test(urlSecret));

    // But it still decodes to the same key: both the input and the URL secret
    // drive the identical OTP, so an authenticator that scans it stays in sync.
    asserts.assertEquals(
      await generateTOTP(urlSecret, { epoch }),
      await generateTOTP(nonCanonical, { epoch }),
    );
    asserts.assert(
      await verifyTOTP(await generateTOTP(nonCanonical, { epoch }), urlSecret, {
        epoch,
      }),
    );

    // Canonical inputs of the same decodable length remain byte-identical, so
    // the change above is specifically the trailing-bit normalisation.
    asserts.assertEquals(
      new URL(
        generateOTPAuthURL({
          type: 'totp',
          secret: canonical,
          accountName: 'u',
          issuer: 'A',
        }),
      ).searchParams.get('secret'),
      canonical,
    );
  });

  it('Supports all hash algorithms', () => {
    const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

    for (const algo of algorithms) {
      const url = generateOTPAuthURL({
        type: 'totp',
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'user@example.com',
        issuer: 'MyApp',
        algorithm: algo,
      });

      const expectedAlgo = algo.replace('-', '');
      asserts.assert(url.includes(`algorithm=${expectedAlgo}`));
    }
  });

  it('Supports different digit lengths', () => {
    const digitLengths = [6, 7, 8];

    for (const digits of digitLengths) {
      const url = generateOTPAuthURL({
        type: 'totp',
        secret: 'JBSWY3DPEHPK3PXP',
        accountName: 'user@example.com',
        issuer: 'MyApp',
        digits,
      });

      asserts.assert(url.includes(`digits=${digits}`));
    }
  });

  it('Error: Invalid type', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          // @ts-expect-error Testing invalid type
          type: 'invalid',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
        }),
      Error,
      'Type must be either "totp" or "hotp"',
    );
  });

  it('Error: Empty secret', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: '',
          accountName: 'user@example.com',
          issuer: 'MyApp',
        }),
      Error,
      'Secret is required and cannot be empty',
    );
  });

  it('Error: Empty account name', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: '',
          issuer: 'MyApp',
        }),
      Error,
      'Account name is required and cannot be empty',
    );
  });

  it('Error: Empty issuer', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: '',
        }),
      Error,
      'Issuer is required and cannot be empty',
    );
  });

  it('Error: Invalid algorithm', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
          // @ts-expect-error Testing invalid algorithm
          algorithm: 'MD5',
        }),
      Error,
      'Algorithm must be one of',
    );
  });

  it('Error: Invalid digits (too low)', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
          digits: 5,
        }),
      Error,
      'Digits must be an integer between 6 and 8',
    );
  });

  it('Error: Invalid digits (too high)', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
          digits: 9,
        }),
      Error,
      'Digits must be an integer between 6 and 8',
    );
  });

  it('Error: Invalid period for TOTP', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
          period: 0,
        }),
      Error,
      'Period must be a positive integer',
    );
  });

  it('Error: Negative counter for HOTP', () => {
    asserts.assertThrows(
      () =>
        generateOTPAuthURL({
          type: 'hotp',
          secret: 'JBSWY3DPEHPK3PXP',
          accountName: 'user@example.com',
          issuer: 'MyApp',
          counter: -1,
        }),
      Error,
      'Counter must be a non-negative integer',
    );
  });

  it('Real-world example: Google', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@gmail.com',
      issuer: 'Google',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });

    // Verify it's a valid otpauth URL
    asserts.assert(url.startsWith('otpauth://totp/'));
    asserts.assert(url.includes('Google:user%40gmail.com'));
    asserts.assert(url.includes('secret=JBSWY3DPEHPK3PXP'));
  });

  it('Real-world example: GitHub with SHA-256', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'BASE32SECRET',
      accountName: 'octocat',
      issuer: 'GitHub',
      algorithm: 'SHA-256',
      digits: 6,
      period: 30,
    });

    asserts.assert(url.includes('algorithm=SHA256'));
    asserts.assert(url.includes('GitHub:octocat'));
  });

  it('Provision→verify round trip: URL defaults match verifyTOTP defaults', async () => {
    // Review regression: generateOTPAuthURL defaulted to SHA-1 while
    // generateTOTP/verifyTOTP defaulted to SHA-256, so an authenticator
    // provisioned from a default URL produced codes that never verified.
    // All OTP defaults are now SHA-1; this test locks the contract in.
    const secret = 'JBSWY3DPEHPK3PXP';
    const epoch = Date.now();

    // 1. Provision with defaults — exactly what a signup flow would emit.
    const url = generateOTPAuthURL({
      type: 'totp',
      secret,
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });

    // 2. The authenticator app reads the algorithm from the URL.
    const params = new URL(url).searchParams;
    const urlAlgo = params.get('algorithm');
    asserts.assertEquals(urlAlgo, 'SHA1');
    const authenticatorAlgo = `${urlAlgo!.slice(0, 3)}-${
      urlAlgo!.slice(3)
    }` as DigestAlgorithms; // 'SHA1' → 'SHA-1'
    const digits = Number(params.get('digits'));
    const period = Number(params.get('period'));

    // 3. The authenticator computes a code from the URL's parameters…
    const authenticatorCode = await generateTOTP(secret, {
      epoch,
      period,
      length: digits,
      algo: authenticatorAlgo,
    });

    // …which must ALSO be what our own defaults produce…
    asserts.assertEquals(
      authenticatorCode,
      await generateTOTP(secret, { epoch }),
    );

    // 4. …and the server verifying with plain defaults must accept it.
    asserts.assertEquals(
      await verifyTOTP(authenticatorCode, secret, { epoch }),
      true,
    );
  });

  it('Provision→verify round trip: HOTP URL defaults match verifyHOTP defaults', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';

    const url = generateOTPAuthURL({
      type: 'hotp',
      secret,
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });

    const params = new URL(url).searchParams;
    asserts.assertEquals(params.get('algorithm'), 'SHA1');
    const counter = Number(params.get('counter'));

    // Authenticator computes with the URL's SHA-1; server verifies with
    // library defaults. Both sides must agree.
    const code = await generateHOTP(secret, counter, { algo: 'SHA-1' });
    asserts.assertEquals(code, await generateHOTP(secret, counter));
    asserts.assertEquals(await verifyHOTP(code, secret, counter), true);
  });

  it('Default algorithm is SHA-1 (RFC 4226 test vector)', async () => {
    // RFC 4226 Appendix D: key "12345678901234567890", counter 0 → "755224"
    // under HMAC-SHA-1. Passing NO algorithm must reproduce it — proving the
    // default is the interop SHA-1, not SHA-256.
    asserts.assertEquals(
      await generateHOTP('12345678901234567890', 0),
      '755224',
    );

    // RFC 6238 Appendix B (SHA-1 mode): T=59s → "287082" with the same key.
    asserts.assertEquals(
      await generateTOTP('12345678901234567890', { epoch: 59000 }),
      '287082',
    );
  });
});
