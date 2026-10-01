import type { PBKDF2Hash } from '../../digest/types/mod.ts';
import type { AESKeyLength } from './AESKeyLength.ts';
import type { AESMode } from './AESMode.ts';

/** Options for AES encryption/decryption. */
export type AESOptions = {
  /**
   * Encryption mode.
   * @default 'GCM'
   */
  mode?: AESMode;

  /**
   * Key length in bits.
   * @default 256
   */
  keyLength?: AESKeyLength;

  /**
   * PBKDF2 settings for deriving the key from a string secret. The envelope
   * does not record them, so decrypt must be given the same values as
   * encrypt. Cloudflare Workers refuses more than 100 000 iterations. Not
   * allowed with a `CryptoKey` secret, which is already derived.
   * @default { iterations: 210_000, hash: 'SHA-256' }
   */
  pbkdf2?: { iterations?: number; hash?: PBKDF2Hash };
};
