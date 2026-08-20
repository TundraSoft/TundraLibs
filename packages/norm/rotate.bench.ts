//
// Key-rotation cost model.
//
// `rotateKey()` re-encrypts each cell: decrypt(oldKey) → encrypt(newKey).
// Both sides derive their key via PBKDF2 per cell (no cache), so the
// CRYPTO dominates end-to-end wall-clock. The two things this feature
// adds around that crypto — the key-id classification that makes rotation
// resumable, and the stamp/verify envelope on every encrypted read/write
// — are measured here against the bare cipher to show they are noise by
// comparison.
//
// Operational read: aggregate downtime ≈ cells × (decrypt + encrypt).
// Take "norm.rotate - re-encrypt one cell" as the per-cell wall-clock and
// multiply by your encrypted-cell count; the paging SELECT + per-row
// UPDATE are dwarfed by PBKDF2 and don't move the estimate.

import { bench } from '@tundralibs/compat/bench';
import {
  DEFAULT_ENCRYPT_ALGORITHM,
  defaultDecrypt,
  defaultEncrypt,
  keyFingerprint,
  readKeyId,
  stampKeyId,
  verifyKeyId,
} from './crypto.ts';

const OLD = 'rotate-bench-old-key-aaaaaaaa';
const NEW = 'rotate-bench-new-key-bbbbbbbb';
const ALGO = DEFAULT_ENCRYPT_ALGORITHM;
const PLAINTEXT = 'sensitive-value@example.dev';

const encStamped = stampKeyId(defaultEncrypt);
const decVerified = verifyKeyId(defaultDecrypt);

// A stamped ciphertext under OLD, and a legacy (un-stamped) one.
const stamped = await encStamped(PLAINTEXT, OLD, ALGO);
const legacy = await defaultEncrypt(PLAINTEXT, OLD, ALGO);

// ── Classification: the per-cell skip/rotate decision (rotation-only) ──
bench({
  name: 'norm.rotate - readKeyId (stamped)',
  group: 'classify',
  baseline: true,
  fn: () => {
    readKeyId(stamped);
  },
});
bench({
  name: 'norm.rotate - readKeyId (legacy)',
  group: 'classify',
  fn: () => {
    readKeyId(legacy);
  },
});
bench({
  name: 'norm.rotate - keyFingerprint (1x SHA-256)',
  group: 'classify',
  fn: async () => {
    await keyFingerprint(OLD);
  },
});

// ── Envelope overhead on the HOT path (every encrypted write / read) ──
bench({
  name: 'norm.crypto - encrypt cell (bare cipher)',
  group: 'encrypt',
  baseline: true,
  fn: async () => {
    await defaultEncrypt(PLAINTEXT, NEW, ALGO);
  },
});
bench({
  name: 'norm.crypto - encrypt cell (key-id stamped)',
  group: 'encrypt',
  fn: async () => {
    await encStamped(PLAINTEXT, NEW, ALGO);
  },
});
bench({
  name: 'norm.crypto - decrypt cell (bare cipher)',
  group: 'decrypt',
  baseline: true,
  fn: async () => {
    await defaultDecrypt(legacy, OLD, ALGO);
  },
});
bench({
  name: 'norm.crypto - decrypt cell (key-id verified)',
  group: 'decrypt',
  fn: async () => {
    await decVerified(stamped, OLD, ALGO);
  },
});

// ── The per-cell rotation work: decrypt(old) → re-encrypt(new) ──
bench({
  name: 'norm.rotate - re-encrypt one cell (decrypt+encrypt)',
  group: 'rotate',
  fn: async () => {
    const canonical = await decVerified(stamped, OLD, ALGO);
    await encStamped(canonical, NEW, ALGO);
  },
});
