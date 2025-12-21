import * as asserts from '$asserts';
import { generateOTPAuthURL } from './mod.ts';

Deno.test('crypt.OTP.generateOTPAuthURL', async (t) => {
  await t.step('Generate TOTP URL with default parameters', () => {
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

  await t.step('Generate TOTP URL with custom parameters', () => {
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

  await t.step('Generate HOTP URL with default parameters', () => {
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

  await t.step('Generate HOTP URL with custom counter', () => {
    const url = generateOTPAuthURL({
      type: 'hotp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user@example.com',
      issuer: 'MyApp',
      counter: 100,
    });

    asserts.assert(url.includes('counter=100'));
  });

  await t.step('URL encodes special characters in account name', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'user+test@example.com',
      issuer: 'My App',
    });

    asserts.assert(url.includes('My%20App:user%2Btest%40example.com'));
  });

  await t.step('Secret is uppercased and spaces removed', () => {
    const url = generateOTPAuthURL({
      type: 'totp',
      secret: 'jbsw y3dp ehpk 3pxp',
      accountName: 'user@example.com',
      issuer: 'MyApp',
    });

    asserts.assert(url.includes('secret=JBSWY3DPEHPK3PXP'));
  });

  await t.step('Supports all hash algorithms', () => {
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

  await t.step('Supports different digit lengths', () => {
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

  await t.step('Error: Invalid type', () => {
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

  await t.step('Error: Empty secret', () => {
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

  await t.step('Error: Empty account name', () => {
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

  await t.step('Error: Empty issuer', () => {
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

  await t.step('Error: Invalid algorithm', () => {
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

  await t.step('Error: Invalid digits (too low)', () => {
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

  await t.step('Error: Invalid digits (too high)', () => {
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

  await t.step('Error: Invalid period for TOTP', () => {
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

  await t.step('Error: Negative counter for HOTP', () => {
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

  await t.step('Real-world example: Google', () => {
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

  await t.step('Real-world example: GitHub with SHA-256', () => {
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
});
