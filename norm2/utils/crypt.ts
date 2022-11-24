import { base64 } from "../../dependencies.ts";

export const encrypt = async (key: string, data: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(16)),
    encoder = new TextEncoder(),
    encoded = encoder.encode(data),
    cryptKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      "AES-CBC",
      false,
      ["encrypt"],
    ),
    ecncrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      cryptKey,
      encoded,
    );

  return base64.encode(new Uint8Array(ecncrypted)) + ":" + base64.encode(iv);
  // return new TextDecoder().decode(hexEncode(new Uint8Array(ecncrypted))) + ':' + new TextDecoder().decode(hexEncode(iv));
};

export const decrypt = async (key: string, data: string): Promise<string> => {
  // const [encrypted, iv] = data.split(':').map(d => hexDecode(new TextEncoder().encode(d))),
  const [encrypted, iv] = data.split(":").map((d) => base64.decode(d)),
    decoder = new TextDecoder(),
    encoder = new TextEncoder(),
    cryptKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      "AES-CBC",
      false,
      ["decrypt"],
    ),
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptKey,
      encrypted,
    );

  return decoder.decode(decrypted);
};

// const key = '12345678901234567890123456789012',
//   encrypted = await encrypt(key, 'Hello World! spopjfsdoign saoign soidgn oidsbgEOIFB3OIFNLEA FLKJB'),
//   decrypted = await decrypt(key, encrypted);
// console.log(key.length)
// console.log(encrypted, decrypted);

// function delay(ms = 1000, message = 'hi'): Promise<string> {
//   // return new Promise(resolve => setTimeout(resolve, ms));
//   return new Promise((resolve) => {
//     setTimeout(() => {
//       resolve(message);
//     }, ms);
//   });
// }

// const a: Record<string, Promise<unknown>> = {};
// a['test'] = delay(1000, 'test1');
// a['test2'] = delay(5000, 'test2');
// a['test3'] = delay(1400, 'test3');
// a['test4'] = delay(700, 'test5');

// console.log('Starting to wait...')
// const c = await Promise.all(Object.values(a));

// console.log('Done waiting...')

// console.log(c);
