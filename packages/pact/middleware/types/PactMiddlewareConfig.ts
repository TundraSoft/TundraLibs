/**
 * @fileoverview {@link PactMiddlewareConfig} — `PactMiddlewareOptions`
 * resolved once: every default filled, templates compiled.
 *
 * @module
 */
import type {
  PactCredential,
  PactHmacAlgorithm,
  PactJweEncryption,
} from '../../types/mod.ts';
import type { SignatureTemplate } from './SignatureTemplate.ts';

/** What `resolveOptions` returns and the core reads per request. */
export type PactMiddlewareConfig = {
  readonly schemes: ReadonlySet<PactCredential['scheme']>;
  readonly bearer: { header: string; prefix: string };
  readonly basic: {
    header: string;
    prefix: string;
    credential: 'user' | 'apiKey';
  };
  readonly apiKey:
    | { header: string; prefix: string }
    | { keyHeader: string; secretHeader: string };
  readonly hmac: {
    keyHeader: string;
    signatureHeader: string;
    timestampHeader: string;
    nonceHeader: string;
    template: SignatureTemplate;
    response: SignatureTemplate | null;
    algorithm: PactHmacAlgorithm;
    maxSkew: number;
  };
  readonly encryption: { enc: PactJweEncryption; required: boolean } | null;
};
