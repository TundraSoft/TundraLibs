import {
  // decode as b64Decode,
  base64,
} from '../../dependencies.ts';

// import { encode as hexEncode } from "https://deno.land/std@0.165.0/encoding/hex.ts";
export const hash = async (data: string): Promise<string> => {
  const encoder = new TextEncoder(),
    encoded = encoder.encode(data),
    hash = await crypto.subtle.digest('SHA-256', encoded);
  // return new TextDecoder().decode(hexEncode(new Uint8Array(hash)));
  return base64.encode(new Uint8Array(hash));
};
