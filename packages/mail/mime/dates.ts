/**
 * @fileoverview RFC 5322 §3.3 date-time parsing, including the obsolete
 * forms (two-digit years, named zones) real mail still carries.
 *
 * @module
 */

import { stripComments } from './headers.ts';

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// RFC 5322 §4.3 obsolete zones; every other alphabetic zone is `-0000`.
const ZONES: Record<string, number> = {
  ut: 0,
  gmt: 0,
  z: 0,
  est: -300,
  edt: -240,
  cst: -360,
  cdt: -300,
  mst: -420,
  mdt: -360,
  pst: -480,
  pdt: -420,
};

const DATE_TIME =
  /^(?:[a-z]{3},?\s*)?(\d{1,2})[\s-]+([a-z]{3})[\s-]+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[a-z]{1,5})?/i;

/**
 * Parse a `Date` header. Returns `undefined` for text no reading of the
 * grammar fits, rather than an invalid `Date`.
 */
export function parseDate(text: string): Date | undefined {
  const cleaned = stripComments(text).trim();
  const m = DATE_TIME.exec(cleaned);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (month !== undefined) {
      let year = Number(m[3]);
      if (m[3]!.length <= 2) year += year < 50 ? 2000 : 1900;
      let offset = 0;
      const zone = m[7];
      if (zone) {
        if (/^[+-]/.test(zone)) {
          const sign = zone[0] === '-' ? -1 : 1;
          offset = sign *
            (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3)));
        } else {
          offset = ZONES[zone.toLowerCase()] ?? 0;
        }
      }
      const utc = Date.UTC(
        year,
        month,
        Number(m[1]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] ?? 0),
      ) - offset * 60_000;
      if (!Number.isNaN(utc)) return new Date(utc);
    }
  }
  const fallback = new Date(cleaned);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
}
