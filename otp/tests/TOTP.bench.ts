import { TOTP } from '../mod.ts';

Deno.bench(`[library='otp' mode='TOTP' algorithm='SHA-1']`, async (b) => {
  await TOTP('12345678901234567890', 'SHA-1', 6, 30);
});

Deno.bench(`[library='otp' mode='TOTP' algorithm='SHA-256']`, async (b) => {
  await TOTP('12345678901234567890', 'SHA-256', 6, 30);
});

Deno.bench(`[library='otp' mode='TOTP' algorithm='SHA-384']`, async (b) => {
  await TOTP('12345678901234567890', 'SHA-384', 6, 30);
});

Deno.bench(`[library='otp' mode='TOTP' algorithm='SHA-512']`, async (b) => {
  await TOTP('12345678901234567890', 'SHA-512', 6, 30);
});
