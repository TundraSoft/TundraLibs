import { assert } from "../../dev_dependencies.ts";
import { decrypt, encrypt } from "../utils/crypt.ts";

Deno.test({
  name: `[module='norm' test='crypt'] Testing decryption`,
  fn: async () => {
    const key = "12345678901234567890123456789012",
      message =
        "Hello World! spopjfsdoign saoign soidgn oidsbgEOIFB3OIFNLEA FLKJB",
      encrypted = await encrypt(key, message),
      decrypted = await decrypt(key, encrypted);
    assert(encrypted !== message);
    assert(decrypted === message);
  },
});
