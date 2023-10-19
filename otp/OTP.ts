import { sprintf } from '../dependencies.ts';

export type OTPAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

function toInt8Array(data: number) {
  const arr = new Uint8Array(8);
    let acc = data;
    for (let i = 7; i >= 0; i--) {
      if (acc === 0) {
        break;
      }
      arr[i] = acc & 255;
      acc -= arr[i];
      acc /= 256;
    }
    return arr;
}

const generate = async (key: string, algo: OTPAlgorithm, length: number, counter: number) => {
  const _key = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: algo }, false, ['sign', 'verify']),
    digest = new Uint8Array(await crypto.subtle.sign('HMAC', _key, toInt8Array(counter))),
    offset = digest[digest.byteLength - 1] & 15,
    op = ((
      ((digest[offset] & 127) << 24) |
      ((digest[offset + 1] & 255) << 16) |
      ((digest[offset + 2] & 255) << 8) |
      (digest[offset + 3] & 255)
    ) % (10 ** length)).toString();
  return sprintf('%0' + length + 's', op);
}

export const TOTP = async (key: string, algo: OTPAlgorithm, length: number, window: number, epoc = Date.now()) => {
  const counter = Math.floor(epoc / 1000 / window);
  return await generate(key, algo, length, counter);
}

export const HOTP = async (key: string, algo: OTPAlgorithm, length: number, counter: number) => {
  return await generate(key, algo, length, counter);
}

// export const verifyOTP = async (key: string, algo: OTPAlgorithm, length: number, counter: number, otp: string) => {
//   const _otp = await HOTP(key, algo, length, counter);
//   return _otp === otp;
// }