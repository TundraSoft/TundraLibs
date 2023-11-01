export * as path from 'https://deno.land/std@0.204.0/path/posix/mod.ts';
export * as fs from 'https://deno.land/std@0.204.0/fs/mod.ts';
export {
  format as dateFormat,
  parse as parseDate,
} from 'https://deno.land/std@0.204.0/datetime/mod.ts';
export { printf, sprintf } from 'https://deno.land/std@0.204.0/fmt/printf.ts';

export { Status, STATUS_TEXT } from 'https://deno.land/std@0.204.0/http/mod.ts';

export type HTTPMethods =
  | 'HEAD'
  | 'OPTIONS'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';
