import { TOTP } from '../mod.ts';
import {
  afterEach,
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe(`[library='otp' mode='TOTP' algorithm='SHA-1']`, () => {
  it('Length of generated OTP must match specified length', async () => {
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
  });

  it('Generated OTP must be unique for the same secret and time', async () => {
    const iter = 30;
    const otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-1', 6, 1)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-1', 6, 1, epoc)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, 1);
  });
});

describe(`[library='otp' mode='TOTP' algorithm='SHA-256']`, () => {
  it('Length of generated OTP must match specified length', async () => {
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
  });

  it('Generated OTP must be unique for the same secret and time', async () => {
    const iter = 30;
    const otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-256', 6, 1)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-256', 6, 1, epoc)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, 1);
  });
});

describe(`[library='otp' mode='TOTP' algorithm='SHA-384']`, () => {
  it('Length of generated OTP must match specified length', async () => {
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
  });

  it('Generated OTP must be unique for the same secret and time', async () => {
    const iter = 30;
    const otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-384', 6, 1)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-384', 6, 1, epoc)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, 1);
  });
});

describe(`[library='otp' mode='TOTP' algorithm='SHA-512']`, () => {
  it('Length of generated OTP must match specified length', async () => {
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
  });

  it('Generated OTP must be unique for the same secret and time', async () => {
    const iter = 30;
    const otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-512', 6, 1)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await TOTP('12345678901234567890', 'SHA-512', 6, 1, epoc)); // Set window as 0
      // Wait for next tick
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assertEquals(otps.size, 1);
  });
});
