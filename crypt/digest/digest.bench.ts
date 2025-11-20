import { digest } from "./mod.ts";

Deno.bench({
  name: "crypt.Digest - SHA-1",
  fn: async () => {
    await digest("SHA-1", "hello world");
  },
});

Deno.bench({
  name: "crypt.Digest - SHA-256",
  fn: async () => {
    await digest("SHA-256", "hello world");
  },
});

Deno.bench({
  name: "crypt.Digest - SHA-384",
  fn: async () => {
    await digest("SHA-384", "hello world");
  },
});

Deno.bench({
  name: "crypt.Digest - SHA-512",
  fn: async () => {
    await digest("SHA-512", "hello world");
  },
});
