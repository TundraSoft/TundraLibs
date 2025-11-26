import { decrypt, encrypt } from './mod.ts';

Deno.bench({
  name: 'crypt.Encrypt - AES-GCM:128',
  fn: async () => {
    await encrypt('AES-GCM:128', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-GCM:256',
  fn: async () => {
    await encrypt('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-CBC:128',
  fn: async () => {
    await encrypt('AES-CBC:128', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'crypt.Encrypt - AES-CBC:256',
  fn: async () => {
    await encrypt('AES-CBC:256', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

// Decrypt
Deno.bench({
  name: 'crypt.Decrypt - AES-GCM:128',
  fn: async () => {
    await decrypt(
      'AES-GCM:128',
      'abcdefghijklmnopqrstuvwx',
      'c0bcbee6889e283b9d8e0c0a1a7c8a21a9139725d1e4ea47efbcf8:ff7f621ddbd27bce15897bf94914cfff',
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-GCM:256',
  fn: async () => {
    await decrypt(
      'AES-GCM:256',
      'abcdefghijklmnopqrstuvwx',
      'c61f0ec28c2159ee743cb7d66c88fa7b4f07d5cca4e4d1c51c987c:404bf56d655107e60ab64c0a2f74e5d0',
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-CBC:128',
  fn: async () => {
    await decrypt(
      'AES-CBC:128',
      'abcdefghijklmnopqrstuvwx',
      '069d727d9567011b28fbdb8d466f2b1a:b20714fa22de5c142bd543998b57a8ae',
    );
  },
});

Deno.bench({
  name: 'crypt.Decrypt - AES-CBC:256',
  fn: async () => {
    await decrypt(
      'AES-CBC:256',
      'abcdefghijklmnopqrstuvwx',
      '44efac3b1fb57e86fc13afcc609045f6:a51b0fa3bd0585ec68666b2cab053a15',
    );
  },
});
