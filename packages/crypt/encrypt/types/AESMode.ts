/**
 * AES encryption mode.
 *
 * - `GCM`: Galois/Counter Mode (recommended — authenticated encryption).
 * - `CBC`: Cipher Block Chaining.
 * - `CTR`: Counter Mode.
 */
export type AESMode = 'GCM' | 'CBC' | 'CTR';
