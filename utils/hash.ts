import { base64, hex } from '../dependencies.ts';

type HashOptions = {
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  encoding: 'HEX' | 'BASE64';
};

const defOptions: HashOptions = {
  algorithm: 'SHA-256',
  encoding: 'HEX',
};

export const hash = async (
  data: unknown,
  opt: HashOptions = defOptions,
): Promise<string> => {
  opt = { ...defOptions, ...opt };
  if (
    !opt.algorithm ||
    !['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(opt.algorithm)
  ) {
    throw new Error(`Invalid algorithm ${opt.algorithm}`);
  }
  if (!opt.encoding || !['HEX', 'BASE64'].includes(opt.encoding)) {
    throw new Error('Invalid encoding');
  }
  const dataString = JSON.stringify(data);
  const hash = await crypto.subtle.digest(
    opt.algorithm,
    new TextEncoder().encode(dataString),
  );
  return (opt.encoding === 'HEX')
    ? hex.encodeHex(new Uint8Array(hash))
    : base64.encodeBase64(new Uint8Array(hash));
};
