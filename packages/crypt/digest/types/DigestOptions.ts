import type { DigestAlgorithms } from './DigestAlgorithms.ts';

/** Options for digest operations. */
export type DigestOptions = {
  /**
   * The hash algorithm to use.
   * @default 'SHA-256'
   */
  algorithm?: DigestAlgorithms;

  /**
   * The output encoding format.
   * @default 'hex'
   */
  encoding?: 'hex' | 'base64';
};
