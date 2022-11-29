import { OTP } from './mod.ts';
import type { iOTPOptions } from './mod.ts';
import { assertEquals } from '../dev.dependencies.ts';

//#region TOTP
Deno.test({
  name: 'Check length of generated OTP using SHA-1 - TOTP',
  async fn(): Promise<void> {
    const TOTPOptions: iOTPOptions = {
      type: 'TOTP',
      key: '12345678901234567890',
      algo: 'SHA-1',
      length: 6,
    };
    const a: OTP = new OTP(TOTPOptions);
    const otp = await a.generate();
    assertEquals(otp.length, 6);
  },
});

Deno.test({
  name: 'Check length of generated OTP using SHA-1 - TOTP',
  fn() {
    const TOTPOptions: iOTPOptions = {
      type: 'TOTP',
      key: '12345678901234567890',
      algo: 'SHA-1',
      length: 6,
      period: 30,
    };
    const otpTimes: Array<number> = [
      Math.floor(59 / 30),
      Math.floor(1111111109 / 30),
      Math.floor(1111111111 / 30),
      Math.floor(1234567890 / 30),
      Math.floor(2000000000 / 30),
      Math.floor(20000000000 / 30),
    ];
    const otpOutput: Array<string> = [
      '287082',
      '081804',
      '050471',
      '005924',
      '279037',
      '353130',
    ];
    const a: OTP = new OTP(TOTPOptions);
    otpTimes.forEach(async (time, index) => {
      const otp = await a.generate(time);
      assertEquals(otp, otpOutput[index]);
    });
  },
});

Deno.test({
  name: 'Check length of generated OTP using SHA-256 - TOTP',
  fn() {
    const TOTPOptions: iOTPOptions = {
      type: 'TOTP',
      key: '12345678901234567890123456789012',
      algo: 'SHA-256',
      length: 8,
      period: 30,
    };
    const otpTimes: Array<number> = [
      Math.floor(59 / 30),
      Math.floor(1111111109 / 30),
      Math.floor(1111111111 / 30),
      Math.floor(1234567890 / 30),
      Math.floor(2000000000 / 30),
      Math.floor(20000000000 / 30),
    ];
    const otpOutput: Array<string> = [
      '46119246',
      '68084774',
      '67062674',
      '91819424',
      '90698825',
      '77737706',
    ];
    const a: OTP = new OTP(TOTPOptions);
    otpTimes.forEach(async (time, index) => {
      const otp = await a.generate(time);
      assertEquals(otp, otpOutput[index]);
    });
  },
});

Deno.test({
  name: 'Check length of generated OTP using SHA-512 - TOTP',
  fn() {
    const TOTPOptions: iOTPOptions = {
      type: 'TOTP',
      key: '1234567890123456789012345678901234567890123456789012345678901234',
      algo: 'SHA-512',
      length: 8,
      period: 30,
    };
    const otpTimes: Array<number> = [
      Math.floor(59 / 30),
      Math.floor(1111111109 / 30),
      Math.floor(1111111111 / 30),
      Math.floor(1234567890 / 30),
      Math.floor(2000000000 / 30),
      Math.floor(20000000000 / 30),
    ];
    const otpOutput: Array<string> = [
      '90693936',
      '25091201',
      '99943326',
      '93441116',
      '38618901',
      '47863826',
    ];
    const a: OTP = new OTP(TOTPOptions);
    otpTimes.forEach(async (time, index) => {
      const otp = await a.generate(time);
      assertEquals(otp, otpOutput[index]);
    });
  },
});
//#endregion TOTP

//#region HOTP
Deno.test({
  name: 'Check length of generated OTP - HOTP',
  async fn(): Promise<void> {
    const HOTPOptions: iOTPOptions = {
      type: 'HOTP',
      key: '12345678901234567890',
      algo: 'SHA-1',
      length: 6,
    };
    const a: OTP = new OTP(HOTPOptions);
    const otp = await a.generate();
    assertEquals(otp.length, 6);
  },
});

Deno.test({
  name: 'Check length of generated OTP using SHA-1 - HOTP',
  fn() {
    const HOTPOptions: iOTPOptions = {
      type: 'HOTP',
      key: '12345678901234567890',
      algo: 'SHA-1',
      length: 6,
      counter: 0,
    };
    const otpTimes: Array<number> = [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
    ];
    const otpOutput: Array<string> = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    const a: OTP = new OTP(HOTPOptions);
    otpTimes.forEach(async (time, index) => {
      const otp = await a.generate(time);
      assertEquals(otp, otpOutput[index]);
    });
  },
});

//#endregion HOTP
