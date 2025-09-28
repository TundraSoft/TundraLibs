import { generateHOTP, generateTOTP } from './mod.ts';

Deno.bench({
  name: 'crypt.OTP - HOTP SHA-1',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, 6, 'SHA-1');
  },
});

Deno.bench({
  name: 'crypt.OTP - HOTP SHA-256',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, 6, 'SHA-256');
  },
});

Deno.bench({
  name: 'crypt.OTP - HOTP SHA-384',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, 6, 'SHA-384');
  },
});

Deno.bench({
  name: 'crypt.OTP - HOTP SHA-512',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, 6, 'SHA-512');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP SHA-1',
  fn: async () => {
    await generateTOTP('12345678901234567890', Date.now(), 30, 6, 'SHA-1');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP SHA-256',
  fn: async () => {
    await generateTOTP('12345678901234567890', Date.now(), 30, 6, 'SHA-256');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP SHA-384',
  fn: async () => {
    await generateTOTP('12345678901234567890', Date.now(), 30, 6, 'SHA-384');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP SHA-512',
  fn: async () => {
    await generateTOTP('12345678901234567890', Date.now(), 30, 6, 'SHA-512');
  },
});

const epoch = new Date('2021-01-01T00:00:00Z').getTime();
Deno.bench({
  name: 'crypt.OTP - TOTP Custom time SHA-1',
  fn: async () => {
    await generateTOTP('12345678901234567890', epoch, 30, 6, 'SHA-1');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP Custom time SHA-256',
  fn: async () => {
    await generateTOTP('12345678901234567890', epoch, 30, 6, 'SHA-256');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP Custom time SHA-384',
  fn: async () => {
    await generateTOTP('12345678901234567890', epoch, 30, 6, 'SHA-384');
  },
});

Deno.bench({
  name: 'crypt.OTP - TOTP Custom time SHA-512',
  fn: async () => {
    await generateTOTP('12345678901234567890', epoch, 30, 6, 'SHA-512');
  },
});
