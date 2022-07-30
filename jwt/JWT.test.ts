import { JWT } from "./JWT.ts";
import type { JWTClaims, JWTOptions } from "./types.ts";
import { alphaNumeric, nanoid } from "../nanoid/mod.ts";
import { assertEquals } from "../dev_dependencies.ts";

Deno.test({
  name: "[module='JWT'] Test signature & Validation - HS256",
  async fn(): Promise<void> {
    const opt: JWTOptions = {
      algo: "HS256",
      key: nanoid(64, alphaNumeric),
      issuer: undefined,
    };
    const j = new JWT(opt),
      claim: JWTClaims = {
        iat: 1658015086,
        nbf: 1658015086,
        jti: "test",
        name: "Abhinav",
        abc: [
          1,
          3,
          5,
        ],
      },
      token = await j.sign(claim),
      vc = await j.verify(token);
    assertEquals(vc, claim);
  },
});

Deno.test({
  name: "[module='JWT'] Test signature & Validation - HS384",
  async fn(): Promise<void> {
    const opt: JWTOptions = {
      algo: "HS384",
      key: nanoid(64, alphaNumeric),
      issuer: undefined,
    };
    const j = new JWT(opt),
      claim: JWTClaims = {
        iat: 1658015086,
        nbf: 1658015086,
        jti: "test",
        name: "Abhinav",
        abc: [
          1,
          3,
          5,
        ],
      },
      token = await j.sign(claim),
      vc = await j.verify(token);
    assertEquals(vc, claim);
  },
});

Deno.test({
  name: "[module='JWT'] Test signature & Validation - HS512",
  async fn(): Promise<void> {
    const opt: JWTOptions = {
      algo: "HS512",
      key: nanoid(64, alphaNumeric),
      issuer: undefined,
    };
    const j = new JWT(opt),
      claim: JWTClaims = {
        iat: 1658015086,
        nbf: 1658015086,
        jti: "test",
        name: "Abhinav",
        abc: [
          1,
          3,
          5,
        ],
      },
      token = await j.sign(claim),
      vc = await j.verify(token);
    assertEquals(vc, claim);
  },
});
