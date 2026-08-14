/**
 * @fileoverview IPv4 / IPv6 helpers — validation, expansion, hex/long
 * conversion, and CIDR range checks. Used by {@link isInSubnet}.
 *
 * @module
 */

/** Loose dotted-decimal pattern. Accepts out-of-range octets — pair with {@link isValidIPv4}. */
export const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
/** Hex / colon / dot characters only — character class, not structure. */
export const IPV6_REGEX = /^[0-9a-fA-F:.]+$/;
/** A single IPv4 octet in 0–255. */
export const IPV4_SEGMENT = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
/** A single IPv6 group (1–4 hex digits). */
export const IPV6_SEGMENT = /^[0-9A-Fa-f]{1,4}$/;

/** Largest valid IPv4 CIDR prefix — the upper bound for `/n` validation. */
export const IPV4_MAX_SUBNET = 32;
/** Width of an IPv4 address, for mask arithmetic. */
export const IPV4_BITS = 32;
/** Width of an IPv6 address, for mask arithmetic. */
export const IPV6_BITS = 128;
/** Bits per IPv4 octet, for the shift that packs dotted-decimal into a long. */
export const OCTET_BITS = 8;
/** Bits per IPv6 group — four hex digits. */
export const IPV6_SEGMENT_BITS = 16;
/** Largest valid IPv6 CIDR prefix — the upper bound for `/n` validation. */
export const IPV6_MAX_SUBNET = 128;

/** True iff `ip` is dotted-decimal IPv4 with every octet in 0–255. */
export const isValidIPv4 = (ip: string): boolean => {
  if (!IPV4_REGEX.test(ip)) return false;

  return ip.split('.').every((octet) => {
    const num = Number.parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Full structural IPv6 validator: rejects multiple `::`, `:::`, mixed
 * IPv4 parts that don't validate, wrong segment counts, and inputs
 * over 45 chars (ReDoS guard).
 */
export const isValidIPv6Structure = (ip: string): boolean => {
  // IPv6 addresses use colons; if no colon is present, it's not IPv6
  if (!ip.includes(':')) return false;

  // Protect against massive inputs which can cause ReDoS on complex regexes
  if (ip.length > 45) return false;
  if (!IPV6_REGEX.test(ip)) return false;

  // Check for invalid colon sequences
  const invalidColonPattern = /:{3,}/;
  if (ip.includes(':::') || invalidColonPattern.exec(ip)) {
    return false;
  }

  // Check for multiple double colons (only one allowed)
  if ((ip.match(/::/g) || []).length > 1) {
    return false;
  }

  // Validate IPv4 part if present
  if (ip.includes('.')) {
    return validateIPv6WithIPv4Part(ip);
  }

  // Validate segment count for non-compressed addresses
  if (!ip.includes('::')) {
    return validateFullIPv6Segments(ip);
  }

  // For compressed addresses, expand and validate the full form
  const expanded = expandIPv6(ip);
  if (!expanded) return false;
  return validateFullIPv6Segments(expanded);

  // All checks are handled above; function returns earlier according to path.
};

function validateIPv6WithIPv4Part(ip: string): boolean {
  const ipv4Pattern = /(\d{1,3}\.){3}\d{1,3}$/;
  const ipv4PartMatch = ipv4Pattern.exec(ip);
  if (!ipv4PartMatch) return false;

  const ipv4Part = ipv4PartMatch[0];
  if (!isValidIPv4(ipv4Part)) return false;

  // Check segment count for IPv4-mapped addresses
  const segments = ip.split(':');
  return ip.includes('::') || segments.length === 7;
}

function validateFullIPv6Segments(ip: string): boolean {
  const segments = ip.split(':');
  if (segments.length !== 8) return false;
  // Each group must be 1–4 hex digits; length alone is not enough (e.g.
  // `12345:1:2:3:4:5:6:7` has 8 groups but an over-long first group). This
  // guards both the full-notation path and the compressed path, which
  // validates its expanded 8-group form through here.
  return segments.every((segment) => IPV6_SEGMENT.test(segment));
}

/**
 * Encode `ipv4` as the two trailing IPv6 hex groups
 * (e.g. `192.168.1.1` → `['c0a8', '101']`), used for IPv4-mapped addresses.
 *
 * @throws {Error} If `ipv4` is not a valid IPv4 address.
 */
export const ipv4ToHexSegments = (ipv4: string): string[] => {
  if (!isValidIPv4(ipv4)) throw new Error(`Invalid IPv4 address: ${ipv4}`);
  const octets = ipv4.split('.').map((o) => Number.parseInt(o, 10));
  // After validation, we know octets has exactly 4 valid numbers
  const [a, b, c, d] = octets as [number, number, number, number];
  return [
    ((a << 8) + b).toString(16),
    ((c << 8) + d).toString(16),
  ];
};

/**
 * Expand any valid IPv6 form (compressed, full, or with a trailing dotted
 * IPv4 part) to the canonical 8-group colon-separated representation. The
 * `::` zero-fill is placed exactly where the token appears, so mixed forms
 * with hex groups on both sides of `::` expand correctly. Returns `null` for
 * invalid input — including a bare IPv4 address or a leading single colon —
 * rather than throwing.
 *
 * @example
 * ```typescript
 * expandIPv6('2001:db8::1');            // '2001:db8:0:0:0:0:0:1'
 * expandIPv6('::ffff:192.168.1.1');     // '0:0:0:0:0:ffff:c0a8:101'
 * expandIPv6('64:ff9b::1:1.2.3.4');     // '64:ff9b:0:0:0:1:102:304'
 * expandIPv6('192.168.1.1');            // null (bare IPv4 is not IPv6)
 * expandIPv6(':ffff:1.2.3.4');          // null (leading single colon)
 * expandIPv6('gggg::1');                // null
 * ```
 */
export const expandIPv6 = (ip: string): string | null => {
  if (!ip) return null;

  const normalizedIP = ip.toLowerCase();

  // Basic validation
  if (!isValidIPv6Input(normalizedIP)) {
    return null;
  }

  // Handle IPv4-mapped IPv6 addresses
  if (normalizedIP.includes('.')) {
    return expandIPv6WithIPv4Part(normalizedIP);
  }

  // Handle compressed notation (::)
  if (normalizedIP.includes('::')) {
    return expandCompressedIPv6(normalizedIP);
  }

  // Handle full notation
  return expandFullIPv6(normalizedIP);
};

function isValidIPv6Input(ip: string): boolean {
  // IPv6 addresses always contain at least one colon; a colon-less string
  // (e.g. a bare dotted-decimal IPv4 like `192.168.1.1`) is not IPv6 and must
  // not be "expanded" into a truncated hex value.
  if (!ip.includes(':')) return false;

  // Check for invalid characters
  if (/[^0-9a-f:.]/.test(ip)) {
    return false;
  }

  // Check for invalid colon sequences
  const invalidColonPattern = /:{3,}/;
  if (ip.includes(':::') || invalidColonPattern.exec(ip)) {
    return false;
  }

  // Simple length guard to mitigate potential regex DoS risks
  if (ip.length > 45) return false;

  return true;
}

function expandIPv6WithIPv4Part(ip: string): string | null {
  const ipv4Pattern = /(\d{1,3}\.){3}\d{1,3}$/;
  const ipv4PartMatch = ipv4Pattern.exec(ip);
  if (!ipv4PartMatch) return null;

  const ipv4Part = ipv4PartMatch[0];
  if (!isValidIPv4(ipv4Part)) return null;

  // Replace the trailing dotted-decimal IPv4 tail with its two equivalent hex
  // groups, turning the whole address into pure-hex IPv6 notation, then defer
  // to the standard expanders. This keeps the position of the `::` zero-fill
  // intact regardless of how many hex groups sit on either side of it — the
  // previous ad-hoc handling relocated the post-`::` groups next to the
  // leading groups for mixed forms like `64:ff9b::1:1.2.3.4`, producing a
  // wrong 128-bit value. Reusing the pure-hex expanders also enforces the
  // 8-group total, so malformed inputs (a leading single colon such as
  // `:ffff:1.2.3.4`, or a bare IPv4) correctly return null.
  const prefix = ip.substring(0, ip.length - ipv4Part.length);
  const hexTail = ipv4ToHexSegments(ipv4Part).join(':');
  const hexIP = prefix + hexTail;

  return hexIP.includes('::')
    ? expandCompressedIPv6(hexIP)
    : expandFullIPv6(hexIP);
}

function expandCompressedIPv6(ip: string): string | null {
  // Ensure there's only one double colon
  if ((ip.match(/::/g) || []).length > 1) return null;

  const [left, right] = ip.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];

  // Calculate how many zero groups to insert. Per RFC 4291 the `::` token
  // must stand for AT LEAST one all-zero group, so a `::` whose explicit
  // groups already total 8 (representing zero groups) is invalid — require at
  // least one missing group rather than merely a non-negative count.
  const missingGroups = 8 - (leftParts.length + rightParts.length);
  if (missingGroups < 1) return null;

  // Create the expanded address
  const zeroGroups = new Array(missingGroups).fill('0');
  const expandedParts = [...leftParts, ...zeroGroups, ...rightParts];

  // Ensure we have exactly 8 parts and replace empty segments
  return expandedParts
    .map((part) => part ?? '0')
    .join(':');
}

function expandFullIPv6(ip: string): string | null {
  const parts = ip.split(':');
  if (parts.length !== 8) return null;

  // Verify each part is valid hex
  const validHexPattern = /^[0-9a-f]{1,4}$/;
  for (const part of parts) {
    if (!validHexPattern.test(part)) {
      return null;
    }
  }

  return parts.join(':');
}

/**
 * Encode `ip` as a 32-character `'0'`/`'1'` string (one octet → 8 bits).
 *
 * @throws {Error} If `ip` is not a valid IPv4 address.
 */
export const ipv4ToBinary = (ip: string): string => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return ip.split('.')
    .map((part) => Number.parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
};

/**
 * Encode `ip` as a 128-character `'0'`/`'1'` string. Compressed and
 * IPv4-mapped forms are expanded first.
 *
 * @throws {Error} If `ip` is not a valid IPv6 address.
 */
export const ipv6ToBinary = (ip: string): string => {
  // Normalize and expand the IPv6 address
  const expandedIP = expandIPv6(ip);
  if (!expandedIP) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // Convert each hexadecimal segment to binary
  return expandedIP.split(':')
    .map((segment) =>
      Number.parseInt(segment, 16).toString(2).padStart(16, '0')
    )
    .join('');
};

/**
 * Encode `ip` as an unsigned 32-bit integer (0–4,294,967,295). Useful
 * for range comparisons.
 *
 * @throws {Error} If `ip` is not a valid IPv4 address.
 */
export const ipv4ToLong = (ip: string): number => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  return ip.split('.')
    .reduce(
      (acc, octet) => (acc << OCTET_BITS) + Number.parseInt(octet, 10),
      0,
    ) >>> 0;
};

/**
 * Whether `ip` falls inside `rangeStart`/`cidr`. Computed via bitwise
 * mask comparison on the 32-bit integer encodings.
 *
 * @throws {Error} On invalid IPv4 strings or out-of-range CIDR.
 *
 * @example
 * ```typescript
 * isIPv4InRange('192.168.1.10', '192.168.1.0', 24); // true
 * ```
 */
export const isIPv4InRange = (
  ip: string,
  rangeStart: string,
  cidr: number,
): boolean => {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`);
  if (!isValidIPv4(rangeStart)) {
    throw new Error(`Invalid IPv4 range start: ${rangeStart}`);
  }
  if (!Number.isInteger(cidr) || cidr < 0 || cidr > IPV4_MAX_SUBNET) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }

  const ipLong = ipv4ToLong(ip);
  const rangeLong = ipv4ToLong(rangeStart);
  // For cidr 0 the mask is all-zero (matches everything). The bit-shift
  // form is avoided here because `1 << 32` is `1 << 0` (JS shifts are
  // mod-32), which would yield a -1 mask that matches nothing.
  const mask = cidr === 0 ? 0 : (~((1 << (IPV4_BITS - cidr)) - 1)) >>> 0;
  return ((ipLong & mask) >>> 0) === ((rangeLong & mask) >>> 0);
};
