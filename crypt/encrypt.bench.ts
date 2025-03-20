import { decrypt, encrypt } from './mod.ts';

Deno.bench({
  name: 'encrypt - AES-GCM:1',
  fn: async () => {
    await encrypt('AES-GCM:128', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-GCM:256',
  fn: async () => {
    await encrypt('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-GCM:384',
  fn: async () => {
    await encrypt('AES-GCM:384', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-GCM:512',
  fn: async () => {
    await encrypt('AES-GCM:512', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-CBC:1',
  fn: async () => {
    await encrypt('AES-CBC:128', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-CBC:256',
  fn: async () => {
    await encrypt('AES-CBC:256', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-CBC:384',
  fn: async () => {
    await encrypt('AES-CBC:384', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

Deno.bench({
  name: 'encrypt - AES-CBC:512',
  fn: async () => {
    await encrypt('AES-CBC:512', 'abcdefghijklmnopqrstuvwx', 'hello world');
  },
});

// Decrypt
Deno.bench({
  name: 'decrypt - AES-GCM:1',
  fn: async () => {
    await decrypt(
      'AES-GCM:128',
      'abcdefghijklmnopqrstuvwx',
      'c0bcbee6889e283b9d8e0c0a1a7c8a21a9139725d1e4ea47efbcf8:ff7f621ddbd27bce15897bf94914cfff',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-GCM:256',
  fn: async () => {
    await decrypt(
      'AES-GCM:256',
      'abcdefghijklmnopqrstuvwx',
      'c61f0ec28c2159ee743cb7d66c88fa7b4f07d5cca4e4d1c51c987c:404bf56d655107e60ab64c0a2f74e5d0',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-GCM:384',
  fn: async () => {
    await decrypt(
      'AES-GCM:384',
      'abcdefghijklmnopqrstuvwx',
      'ba17fd25d7a011cc311ab2c2913c06cb2a8799506e174883c9f8d2:6260010b1c328b676ead16e97b3c230d',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-GCM:512',
  fn: async () => {
    await decrypt(
      'AES-GCM:512',
      'abcdefghijklmnopqrstuvwx',
      '4504073cecd0888959a1187e528b0f7525b7eb74a1b02764c858f8:4d63a1329ba95f78e36aabc11920d3b4',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-CBC:1',
  fn: async () => {
    await decrypt(
      'AES-CBC:128',
      'abcdefghijklmnopqrstuvwx',
      '069d727d9567011b28fbdb8d466f2b1a:b20714fa22de5c142bd543998b57a8ae',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-CBC:256',
  fn: async () => {
    await decrypt(
      'AES-CBC:256',
      'abcdefghijklmnopqrstuvwx',
      '44efac3b1fb57e86fc13afcc609045f6:a51b0fa3bd0585ec68666b2cab053a15',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-CBC:384',
  fn: async () => {
    await decrypt(
      'AES-CBC:384',
      'abcdefghijklmnopqrstuvwx',
      'a21164d655cf659c2ef4356318c51601:d2f467f4e72e61c462f1071064cbf9af',
    );
  },
});

Deno.bench({
  name: 'decrypt - AES-CBC:512',
  fn: async () => {
    await decrypt(
      'AES-CBC:512',
      'abcdefghijklmnopqrstuvwx',
      'd9db8d1359a904b1020ed6a5bb27d6c0:ccefd727ae5e767c70ba40e70f44573a',
    );
  },
});
