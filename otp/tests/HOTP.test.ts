import { HOTP } from '../mod.ts';
import {
  afterEach,
  assertEquals,
  beforeEach,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe(`[library='otp' mode='HOTP' algorithm='SHA-1']`, () => {
  it('Length of generated OTP must match specified length', async () => {
    // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
    const lengths = [4, 6, 8, 10, 12];
    for (let i = 0; i < 100; i++) {
      const otps = await Promise.all(lengths.map(async (length) => {
        return await HOTP('12345678901234567890', 'SHA-1', length, 1);
      }));
      otps.forEach((otp, index) => {
        assertEquals(otp.length, lengths[index]);
      });
    }
  });

  it('Generated OTP must be unique for the same secret and counter', async () => {
    const iter = 30;
    const otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await HOTP('12345678901234567890', 'SHA-1', 6, i)); // Set window as 0
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await HOTP('12345678901234567890', 'SHA-1', 6, 1)); // Set window as 0
    }
    assertEquals(otps.size, 1);
  });

  it('Validate standard OTP test case', async () => {
    const testCase = {
        0: '755224',
        1: '287082',
        2: '359152',
        3: '969429',
        4: '338314',
        5: '254676',
        6: '287922',
        7: '162583',
        8: '399871',
        9: '520489',
      },
      key = '12345678901234567890';
    for (const counter in Object.keys(testCase)) {
      const otp = await HOTP(key, 'SHA-1', 6, parseInt(counter));
      assertEquals(otp, testCase[counter as unknown as keyof typeof testCase]);
    }
  });
});

describe(`[library='otp' mode='HOTP' algorithm='SHA-256']`, () => {
  it('Length of generated OTP must match specified length', async () => {
    // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
    const lengths = [4, 6, 8, 10, 12];
    for (let i = 0; i < 100; i++) {
      const otps = await Promise.all(lengths.map(async (length) => {
        return await HOTP('12345678901234567890', 'SHA-256', length, 1);
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
      otps.add(await HOTP('12345678901234567890', 'SHA-256', 6, i)); // Set window as 0
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await HOTP('12345678901234567890', 'SHA-256', 6, 1)); // Set window as 0
    }
    assertEquals(otps.size, 1);
  });
});

describe(`[library='otp' mode='HOTP' algorithm='SHA-384']`, () => {
  it('Length of generated OTP must match specified length', async () => {
    // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
    const lengths = [4, 6, 8, 10, 12];
    for (let i = 0; i < 100; i++) {
      const otps = await Promise.all(lengths.map(async (length) => {
        return await HOTP('12345678901234567890', 'SHA-384', length, 1);
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
      otps.add(await HOTP('12345678901234567890', 'SHA-384', 6, i)); // Set window as 0
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await HOTP('12345678901234567890', 'SHA-384', 6, 1)); // Set window as 0
    }
    assertEquals(otps.size, 1);
  });
});

describe(`[library='otp' mode='HOTP' algorithm='SHA-512']`, () => {
  it('Length of generated OTP must match specified length', async () => {
    // Generate random 100 OTPs of lengths 4, 6, 8, 10, 12
    const lengths = [4, 6, 8, 10, 12];
    for (let i = 0; i < 100; i++) {
      const otps = await Promise.all(lengths.map(async (length) => {
        return await HOTP('12345678901234567890', 'SHA-512', length, 1);
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
      otps.add(await HOTP('12345678901234567890', 'SHA-512', 6, i)); // Set window as 0
    }
    assertEquals(otps.size, iter);
  });

  it('OTP must be the same when generated within same time + interval', async () => {
    const iter = 30,
      epoc = Date.now(),
      otps = new Set<string>();
    for (let i = 0; i < iter; i++) {
      otps.add(await HOTP('12345678901234567890', 'SHA-512', 6, 1)); // Set window as 0
    }
    assertEquals(otps.size, 1);
  });

  it('RFC-4226 Specification Test Vectors', async () => {
    const data = {
      0: '755224',
      1: '287082',
      2: '359152',
      3: '969429',
      4: '338314',
      5: '254676',
      6: '287922',
      7: '162583',
      8: '399871',
      9: '520489',
    };
    await Object.entries(data).forEach(async ([key, value]) => {
      assertEquals(
        await HOTP('12345678901234567890', 'SHA-1', 6, Number(key)),
        value,
      );
    });
  });
});