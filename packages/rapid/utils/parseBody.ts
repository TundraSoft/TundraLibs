/**
 * @fileoverview `parseBody` — the request-body engine, decoupled from
 * the HTTP context so it can be tested and reused independently. It
 * enforces a hard byte ceiling on the bytes ACTUALLY read (chunked /
 * missing / lying content-length safe), dispatches by content type, and
 * runs the upload gauntlet (per-file size, extension allowlist, and a
 * magic-byte content check). File writes are reported back so the
 * caller owns cleanup.
 *
 * @module
 */

import { deleteFile, writeFile } from '@tundralibs/compat/file';
import { ulid } from '@tundralibs/id';
import * as path from '@tundralibs/compat/path';
import { RapidError } from '../errors/mod.ts';
import { mimeTypeFor } from './mimeTypeFor.ts';
import type {
  RapidApplicationUploadOptions,
  RapidHTTPRequestBody,
} from '../types/mod.ts';

/** Config the parser needs, sourced from the app's server/upload options. */
export type ParseBodyOptions = {
  /**
   * Byte ceiling for non-multipart bodies (`0` disables). Multipart is
   * capped separately at `max(maxBodySize, uploads.maxSize)`, since its
   * files have their own per-file limit.
   */
  maxBodySize: number;
  /** Upload handling — `path` is required (always set at runtime). */
  uploads: RapidApplicationUploadOptions & { path?: string };
};

/** Parse result: the body plus the temp files written (for cleanup). */
export type ParseBodyResult = {
  value: RapidHTTPRequestBody;
  /** Absolute paths of files written to disk — the caller deletes these. */
  files: string[];
};

/**
 * Magic-byte signatures for the upload content check. A `.png` whose
 * bytes are not a PNG is rejected regardless of its (client-supplied)
 * declared MIME type. Extensions with no signature here skip the check
 * (the allowlist already gated them).
 */
const FILE_SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  '.png': (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e &&
    b[3] === 0x47,
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  '.pdf': (b) =>
    b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 &&
    b[3] === 0x46,
  '.zip': (b) => b[0] === 0x50 && b[1] === 0x4b,
  '.webp': (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

/**
 * Read a body stream with a hard byte ceiling — enforced on bytes
 * ACTUALLY read, so a chunked body (no content-length), a missing
 * header, or a lying header cannot bypass it.
 * @throws {RapidError} RAPID_PAYLOAD_TOO_LARGE past `cap` (`cap <= 0`
 *   disables).
 */
async function readCapped(
  stream: ReadableStream<Uint8Array> | null,
  cap: number,
): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (cap > 0 && total > cap) {
        throw new RapidError('RAPID_PAYLOAD_TOO_LARGE', {
          details: { maxBytes: cap },
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Apply the upload gauntlet and normalise repeated fields to arrays.
 * Written file paths are pushed onto `files`.
 * @throws {RapidError} RAPID_PAYLOAD_TOO_LARGE / RAPID_UNSUPPORTED_MEDIA.
 */
async function collectFormData(
  data: FormData,
  uploads: ParseBodyOptions['uploads'],
  files: string[],
): Promise<Record<string, unknown>> {
  const maxFileSize = uploads.maxSize;
  const allowedExtensions = uploads.allowedExtensions;
  const uploadPath = uploads.path;
  // NULL-PROTOTYPE accumulator — a field literally named `__proto__`
  // would otherwise hit Object.prototype's setter: the `existing` read
  // below returns the inherited prototype (not `undefined`), so the
  // else-branch stores `[Object.prototype, value]` INTO the prototype
  // slot, swapping this object's prototype and losing the field. With
  // no prototype, such a field is an ordinary own key.
  const formData: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;

  const append = (key: string, value: unknown) => {
    const existing = formData[key];
    if (existing === undefined) {
      formData[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      // A repeated field (value-then-file, file-then-value, or two
      // values) becomes an array — never a crash, never a silent loss.
      formData[key] = [existing, value];
    }
  };

  for (const [key, value] of data.entries()) {
    if (!(value instanceof File)) {
      append(key, value);
      continue;
    }
    // No filesystem (Workers, browser): a text-only multipart form is
    // fine — an actual file has nowhere to land, so reject it explicitly
    // rather than TypeError on `path.join(undefined, …)`.
    if (uploadPath === undefined) {
      throw new RapidError('RAPID_UPLOADS_UNAVAILABLE', {
        details: { file: value.name },
      });
    }
    const extension = path.extname(value.name).toLowerCase();
    if (maxFileSize && value.size > maxFileSize) {
      throw new RapidError('RAPID_PAYLOAD_TOO_LARGE', {
        details: { file: value.name, size: value.size, maxFileSize },
      });
    }
    if (allowedExtensions && !allowedExtensions.includes(extension)) {
      throw new RapidError('RAPID_UNSUPPORTED_MEDIA', {
        message: 'File extension not allowed',
        details: { file: value.name, extension },
      });
    }
    const buffer = new Uint8Array(await value.arrayBuffer());
    // Content check by MAGIC BYTES — the file must actually be what its
    // extension claims (a client-set MIME string proves nothing).
    const signature = FILE_SIGNATURES[extension];
    if (signature !== undefined && !signature(buffer)) {
      throw new RapidError('RAPID_UNSUPPORTED_MEDIA', {
        message: 'File content does not match its extension',
        details: { file: value.name, extension },
      });
    }
    // An INDEPENDENT per-file ulid: neither the client's filename NOR
    // the (adoptable, thus client-controlled) requestId touches disk.
    const fileName = path.join(uploadPath, `${ulid()}${extension}`);
    await writeFile(fileName, buffer);
    files.push(fileName);
    append(key, {
      name: value.name,
      path: fileName,
      // Server-derived from the (allowlist + magic-byte-validated)
      // extension via @std/media-types — NOT the client's `value.type`,
      // which is unverified and "proves nothing" (see the check above).
      type: mimeTypeFor(value.name),
      size: value.size,
    });
  }
  return formData;
}

/**
 * Parse `request`'s body per `options`. Returns the parsed value and the
 * list of temp files written (for the caller to clean up). Never reads
 * the stream more than once.
 *
 * @throws {RapidError} RAPID_PAYLOAD_TOO_LARGE (over the byte cap or a
 *   per-file limit), RAPID_VALIDATION_FAILED (malformed JSON — a client
 *   error), or RAPID_UNSUPPORTED_MEDIA (upload gauntlet).
 */
export async function parseBody(
  request: Request,
  options: ParseBodyOptions,
): Promise<ParseBodyResult> {
  const files: string[] = [];
  // Strip parameters (charset, boundary): match the media type only.
  const rawContentType = request.headers.get('content-type');
  const contentType = (rawContentType ?? '')
    .split(';')[0]!.trim().toLowerCase();
  const isMultipart = contentType === 'multipart/form-data';
  const isForm = isMultipart ||
    contentType === 'application/x-www-form-urlencoded';

  // Multipart carries file uploads gated by their OWN per-file cap —
  // subjecting it to the small JSON body cap would make uploads larger
  // than `maxBodySize` unreachable (the 1 MB vs 10 MB contradiction).
  const cap = isMultipart
    ? Math.max(options.maxBodySize, options.uploads.maxSize ?? 0)
    : options.maxBodySize;
  const bytes = await readCapped(request.body, cap);

  if (isForm) {
    const response = new Response(
      bytes as unknown as BodyInit,
      rawContentType ? { headers: { 'content-type': rawContentType } } : {},
    );
    const data = await response.formData();
    try {
      return {
        value: await collectFormData(data, options.uploads, files),
        files,
      };
    } catch (error) {
      // The gauntlet rejected a later part AFTER earlier files were already
      // written to disk. `files` never reaches the caller on this throw, so
      // clean up here — otherwise a partial multipart strands temp files
      // (repeatable → disk-fill DoS). Best-effort; the throw still wins.
      await Promise.all(files.map((f) => deleteFile(f).catch(() => {})));
      throw error;
    }
  }

  const text = new TextDecoder().decode(bytes);
  if (!rawContentType) {
    // No declared type: opportunistic JSON, else the raw text.
    try {
      return { value: JSON.parse(text), files };
    } catch {
      return { value: text, files };
    }
  }
  if (contentType === 'application/json' || contentType.endsWith('+json')) {
    try {
      return { value: text === '' ? {} : JSON.parse(text), files };
    } catch (cause) {
      // A malformed JSON body is a CLIENT error (400), not a 500.
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        message: 'Request body is not valid JSON',
        cause: cause instanceof Error ? cause : undefined,
      });
    }
  }
  // text/* and everything else → the decoded text.
  return { value: text, files };
}
