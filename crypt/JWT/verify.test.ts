import * as asserts from "$asserts";
import { issueJWT } from "./issue.ts";
import { JWTError } from "./Error.ts";
import type { JWTPayload, JWTVerifyOptions } from "./types.ts";
import { verifyJWT } from "./verify.ts";

const TEST_SECRET = "test-secret-at-least-256-bits-long-for-testing-purposes";

Deno.test("crypt.JWT.verify", async (t) => {
  await t.step("verifyJWT - Basic Verification", async () => {
    const payload: JWTPayload = {
      sub: "1234567890",
      name: "John Doe",
      admin: true,
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);

    asserts.assertEquals(decoded.sub, payload.sub);
    asserts.assertEquals(decoded.name, payload.name);
    asserts.assertEquals(decoded.admin, payload.admin);
    asserts.assertEquals(typeof decoded.iat, "number");
  });

  await t.step("verifyJWT - Time-based Claims", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      exp: now + 3600, // Expires in 1 hour
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);
    asserts.assertEquals(decoded.exp, payload.exp);
  });

  await t.step("verifyJWT - Expired Tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      exp: now - 3600, // Expired 1 hour ago
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Not Before Claims", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      nbf: now + 3600, // Not valid for 1 hour
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Clock Tolerance", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      exp: now - 10, // Expired 10 seconds ago
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    const options: JWTVerifyOptions = {
      clockTolerance: 30, // 30 seconds tolerance
    };

    const decoded = await verifyJWT(token, TEST_SECRET, options);
    asserts.assertEquals(decoded.sub, "test");
  });

  await t.step("verifyJWT - Maximum Age", async () => {
    const payload: JWTPayload = {
      sub: "test",
      iat: Math.floor(Date.now() / 1000) - 10, // Token issued 10 seconds ago
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    const options: JWTVerifyOptions = {
      maxAge: 5, // 5 seconds max age, token is 10 seconds old
    };

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options);
      },
      JWTError,
      "JWT exceeds maximum age",
    );
  });

  await t.step("verifyJWT - Issuer Validation", async () => {
    const payload: JWTPayload = {
      sub: "test",
      iss: "auth.example.com",
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    // Valid issuer
    const options1: JWTVerifyOptions = {
      issuer: "auth.example.com",
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.iss, "auth.example.com");

    // Invalid issuer
    const options2: JWTVerifyOptions = {
      issuer: "wrong.example.com",
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Subject Validation", async () => {
    const payload: JWTPayload = {
      sub: "user123",
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    // Valid subject
    const options1: JWTVerifyOptions = {
      subject: "user123",
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.sub, "user123");

    // Invalid subject
    const options2: JWTVerifyOptions = {
      subject: "user456",
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Audience Validation (String)", async () => {
    const payload: JWTPayload = {
      sub: "test",
      aud: "api.example.com",
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    // Valid audience
    const options1: JWTVerifyOptions = {
      audience: "api.example.com",
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.aud, "api.example.com");

    // Invalid audience
    const options2: JWTVerifyOptions = {
      audience: "wrong.example.com",
    };
    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, TEST_SECRET, options2);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Audience Validation (Array)", async () => {
    const payload: JWTPayload = {
      sub: "test",
      aud: ["api.example.com", "web.example.com"],
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    // Valid audience (matches one)
    const options1: JWTVerifyOptions = {
      audience: "api.example.com",
    };
    const decoded1 = await verifyJWT(token, TEST_SECRET, options1);
    asserts.assertEquals(decoded1.aud, ["api.example.com", "web.example.com"]);

    // Valid audience (array)
    const options2: JWTVerifyOptions = {
      audience: ["api.example.com"],
    };
    const decoded2 = await verifyJWT(token, TEST_SECRET, options2);
    asserts.assertEquals(decoded2.aud, ["api.example.com", "web.example.com"]);
  });

  await t.step("verifyJWT - Ignore Options", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      exp: now - 3600, // Expired
      nbf: now + 3600, // Not yet valid
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    const options: JWTVerifyOptions = {
      ignoreExpiration: true,
      ignoreNotBefore: true,
    };

    const decoded = await verifyJWT(token, TEST_SECRET, options);
    asserts.assertEquals(decoded.sub, "test");
  });

  await t.step("verifyJWT - Invalid Token Format", async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT("invalid.token", TEST_SECRET);
      },
      JWTError,
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT("invalid", TEST_SECRET);
      },
      JWTError,
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT("", TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Invalid Signature", async () => {
    const payload: JWTPayload = { sub: "test" };
    const token = await issueJWT("HS256", payload, TEST_SECRET);
    const wrongSecret = "wrong-secret";

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, wrongSecret);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Malformed JWT Parts", async () => {
    const validToken = await issueJWT("HS256", { sub: "test" }, TEST_SECRET);
    const parts = validToken.split(".");

    // Invalid header
    const invalidHeader = "invalid." + parts[1] + "." + parts[2];
    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidHeader, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid payload
    const invalidPayload = parts[0] + ".invalid." + parts[2];
    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidPayload, TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - Empty Secret", async () => {
    const token = await issueJWT("HS256", { sub: "test" }, TEST_SECRET);

    await asserts.assertRejects(
      async () => {
        await verifyJWT(token, "");
      },
      JWTError,
    );
  });

  await t.step("verifyJWT - All Algorithms", async () => {
    const payload: JWTPayload = { sub: "test" };
    const algorithms = ["HS256", "HS384", "HS512"] as const;

    for (const algo of algorithms) {
      const token = await issueJWT(algo, payload, TEST_SECRET);
      const decoded = await verifyJWT(token, TEST_SECRET);
      asserts.assertEquals(decoded.sub, "test");
    }
  });

  await t.step("verifyJWT - Complex Payload", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      role: "admin",
      permissions: ["read", "write"],
      metadata: { department: "engineering" },
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    const decoded = await verifyJWT(token, TEST_SECRET);

    asserts.assertEquals(decoded.sub, payload.sub);
    asserts.assertEquals(decoded.role, payload.role);
    asserts.assertEquals(decoded.permissions, payload.permissions);
    asserts.assertEquals(decoded.metadata, payload.metadata);
  });

  await t.step("verifyJWT - Token with no token string", async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT("", TEST_SECRET);
      },
      JWTError,
      "Token must be a non-empty string",
    );
  });

  await t.step("verifyJWT - Token with null token", async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT(null as any, TEST_SECRET);
      },
      JWTError,
      "Token must be a non-empty string",
    );
  });

  await t.step("verifyJWT - Token with invalid parts count", async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT("header.payload", TEST_SECRET);
      },
      JWTError,
      "Invalid JWT format",
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT("header.payload.signature.extra", TEST_SECRET);
      },
      JWTError,
      "Invalid JWT format",
    );
  });

  await t.step("verifyJWT - Token with empty parts", async () => {
    await asserts.assertRejects(
      async () => {
        await verifyJWT(".payload.signature", TEST_SECRET);
      },
      JWTError,
      "Invalid JWT format - missing parts",
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT("header..signature", TEST_SECRET);
      },
      JWTError,
      "Invalid JWT format - missing parts",
    );

    await asserts.assertRejects(
      async () => {
        await verifyJWT("header.payload.", TEST_SECRET);
      },
      JWTError,
      "Invalid JWT format - missing parts",
    );
  });

  await t.step("verifyJWT - Invalid header JSON", async () => {
    const invalidHeaderToken = "invalid-base64.eyJzdWIiOiJ0ZXN0In0.signature";

    await asserts.assertRejects(
      async () => {
        await verifyJWT(invalidHeaderToken, TEST_SECRET);
      },
      JWTError,
      "Invalid JWT header",
    );
  });

  await t.step("verifyJWT - Header missing required fields", async () => {
    // Header without alg
    const noAlgHeader = btoa(JSON.stringify({ typ: "JWT" }));
    const noAlgToken = `${noAlgHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(noAlgToken, TEST_SECRET);
      },
      JWTError,
      "Invalid JWT header format",
    );

    // Header without typ
    const noTypHeader = btoa(JSON.stringify({ alg: "HS256" }));
    const noTypToken = `${noTypHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(noTypToken, TEST_SECRET);
      },
      JWTError,
      "Invalid JWT header format",
    );

    // Header with wrong typ
    const wrongTypHeader = btoa(
      JSON.stringify({ alg: "HS256", typ: "NOT_JWT" }),
    );
    const wrongTypToken = `${wrongTypHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(wrongTypToken, TEST_SECRET);
      },
      JWTError,
      "Invalid JWT header format",
    );
  });

  await t.step("verifyJWT - Unsupported algorithm", async () => {
    const unsupportedHeader = btoa(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    );
    const unsupportedToken =
      `${unsupportedHeader}.eyJzdWIiOiJ0ZXN0In0.signature`;

    await asserts.assertRejects(
      async () => {
        await verifyJWT(unsupportedToken, TEST_SECRET);
      },
      JWTError,
      "Unsupported algorithm: RS256",
    );
  });

  await t.step(
    "verifyJWT - Signature verification error handling",
    async () => {
      const payload = { sub: "test" };
      const token = await issueJWT("HS256", payload, TEST_SECRET);

      // Test with wrong secret
      await asserts.assertRejects(
        async () => {
          await verifyJWT(token, "wrong-secret");
        },
        JWTError,
        "Invalid signature",
      );
    },
  );
});
