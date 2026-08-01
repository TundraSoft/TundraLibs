/**
 * @module
 *
 * Migration filename scheme: zero-padded SEQUENCE numbers, not
 * timestamps — parallel branches minting the same number surface as a
 * git conflict on the filename, which is the correct alarm.
 *
 * @since 1.0.0
 */

const FILE_RE = /^(\d+)\.json$/i;

/** Parse `0001.json` → 1; null for anything else. */
export function parseVersion(filename: string): number | null {
  const m = FILE_RE.exec(filename);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Format 1 → `0001.json` (pad grows past 9999 without truncation). */
export function formatVersionFilename(version: number, pad = 4): string {
  return `${String(version).padStart(pad, '0')}.json`;
}
