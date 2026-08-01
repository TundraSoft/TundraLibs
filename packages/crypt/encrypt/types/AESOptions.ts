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
};
