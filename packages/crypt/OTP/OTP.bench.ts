import { bench } from '@tundralibs/compat/bench';
import { generateHOTP, generateTOTP } from './mod.ts';

bench({
  name: 'crypt.OTP - HOTP SHA-1',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, { algo: 'SHA-1' });
  },
});

bench({
  name: 'crypt.OTP - HOTP SHA-256',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, { algo: 'SHA-256' });
  },
});

bench({
  name: 'crypt.OTP - HOTP SHA-384',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, { algo: 'SHA-384' });
  },
});

bench({
  name: 'crypt.OTP - HOTP SHA-512',
  fn: async () => {
    await generateHOTP('12345678901234567890', 0, { algo: 'SHA-512' });
  },
});

bench({
  name: 'crypt.OTP - TOTP SHA-1',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch: Date.now(),
      period: 30,
      algo: 'SHA-1',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP SHA-256',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch: Date.now(),
      period: 30,
      algo: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP SHA-384',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch: Date.now(),
      period: 30,
      algo: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP SHA-512',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch: Date.now(),
      period: 30,
      algo: 'SHA-512',
    });
  },
});

const epoch = new Date('2021-01-01T00:00:00Z').getTime();
bench({
  name: 'crypt.OTP - TOTP Custom time SHA-1',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch,
      period: 30,
      algo: 'SHA-1',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP Custom time SHA-256',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch,
      period: 30,
      algo: 'SHA-256',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP Custom time SHA-384',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch,
      period: 30,
      algo: 'SHA-384',
    });
  },
});

bench({
  name: 'crypt.OTP - TOTP Custom time SHA-512',
  fn: async () => {
    await generateTOTP('12345678901234567890', {
      epoch,
      period: 30,
      algo: 'SHA-512',
    });
  },
});
