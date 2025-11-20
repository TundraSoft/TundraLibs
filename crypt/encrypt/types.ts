/**
 * Supported encryption modes combining algorithm, key lengths, and hash functions.
 *
 * AES Format: `{Algorithm}:{KeyLength}` where:
 * - Algorithm: AES-GCM (Galois/Counter Mode), AES-CBC (Cipher Block Chaining), or AES-CTR (Counter Mode)
 * - KeyLength: 128, 192, or 256 bits (standard AES key sizes)
 *
 * RSA Format: `{Algorithm}:{KeyLength}:{HashAlgorithm}` where:
 * - Algorithm: RSA-OAEP (Optimal Asymmetric Encryption Padding)
 * - KeyLength: 2048, 3072, or 4096 bits (secure RSA key sizes)
 * - HashAlgorithm: SHA-1, SHA-256, SHA-384, or SHA-512
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt} Web Crypto API encryption
 */
export type EncryptionModes =
  | "AES-GCM:128"
  | "AES-GCM:192"
  | "AES-GCM:256"
  | "AES-CBC:128"
  | "AES-CBC:192"
  | "AES-CBC:256"
  | "AES-CTR:128"
  | "AES-CTR:192"
  | "AES-CTR:256"
  | "RSA-OAEP:2048:SHA-1"
  | "RSA-OAEP:2048:SHA-256"
  | "RSA-OAEP:2048:SHA-384"
  | "RSA-OAEP:2048:SHA-512"
  | "RSA-OAEP:3072:SHA-1"
  | "RSA-OAEP:3072:SHA-256"
  | "RSA-OAEP:3072:SHA-384"
  | "RSA-OAEP:3072:SHA-512"
  | "RSA-OAEP:4096:SHA-1"
  | "RSA-OAEP:4096:SHA-256"
  | "RSA-OAEP:4096:SHA-384"
  | "RSA-OAEP:4096:SHA-512";
