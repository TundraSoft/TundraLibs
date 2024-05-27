import { HOTP } from '../mod.ts';

Deno.bench(`[library='otp' mode='HOTP' algorithm='SHA-1']`, async () => {
  await HOTP('12345678901234567890', 'SHA-1', 6, 1213123123);
});

Deno.bench(`[library='otp' mode='HOTP' algorithm='SHA-256']`, async () => {
  await HOTP('12345678901234567890', 'SHA-256', 6, 1213123123);
});

Deno.bench(`[library='otp' mode='HOTP' algorithm='SHA-384']`, async () => {
  await HOTP('12345678901234567890', 'SHA-384', 6, 1213123123);
});

Deno.bench(`[library='otp' mode='HOTP' algorithm='SHA-512']`, async () => {
  await HOTP('12345678901234567890', 'SHA-512', 6, 1213123123);
});