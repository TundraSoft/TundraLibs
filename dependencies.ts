//#region Deno STD
export * as path from 'https://deno.land/std@0.205.0/path/posix/mod.ts';
export * as fs from 'https://deno.land/std@0.205.0/fs/mod.ts';
export {
  format as dateFormat,
  parse as parseDate,
} from 'https://deno.land/std@0.205.0/datetime/mod.ts';
export { printf, sprintf } from 'https://deno.land/std@0.205.0/fmt/printf.ts';

export * as yaml from 'https://deno.land/std@0.205.0/yaml/mod.ts';
export * as toml from 'https://deno.land/std@0.205.0/toml/mod.ts';

export { Status, STATUS_TEXT } from 'https://deno.land/std@0.205.0/http/mod.ts';

//#endregion Deno STD
export type HTTPMethods =
  | 'HEAD'
  | 'OPTIONS'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

//#region Databases
export { connect as RedisConnect } from 'https://deno.land/x/redis@v0.30.0/mod.ts';
export type { Redis } from 'https://deno.land/x/redis@v0.30.0/mod.ts';
//#endregion Databases
