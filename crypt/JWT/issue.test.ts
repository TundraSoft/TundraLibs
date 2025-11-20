import * as asserts from "$asserts";
import { issueJWT } from "./issue.ts";
import { JWTError } from "./Error.ts";
import type { JWTAlgorithm, JWTPayload } from "./types.ts";
const TEST_SECRET = "test-secret-at-least-256-bits-long-for-testing-purposes";

Deno.test("crypt.JWT.issue", async (t) => {
  await t.step("issueJWT - Basic Token Creation", async () => {
    const payload: JWTPayload = {
      sub: "1234567890",
      name: "John Doe",
      admin: true,
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);

    asserts.assertEquals(typeof token, "string");
    const parts = token.split(".");
    asserts.assertEquals(parts.length, 3);
  });

  await t.step("issueJWT - All Algorithms", async () => {
    const payload: JWTPayload = { sub: "test" };
    const algorithms: JWTAlgorithm[] = ["HS256", "HS384", "HS512"];

    for (const algo of algorithms) {
      const token = await issueJWT(algo, payload, TEST_SECRET);
      asserts.assertEquals(typeof token, "string");
      const parts = token.split(".");
      asserts.assertEquals(parts.length, 3);
    }
  });

  await t.step("issueJWT - Custom Claims", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      role: "admin",
      permissions: ["read", "write"],
      metadata: { department: "engineering" },
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
    const parts = token.split(".");
    asserts.assertEquals(parts.length, 3);
  });

  await t.step("issueJWT - Time-based Claims", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: "test",
      exp: now + 3600, // Expires in 1 hour
      nbf: now, // Not before now
      iat: now, // Issued at now
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Automatic iat Setting", async () => {
    const payload: JWTPayload = {
      sub: "service-account",
      // iat will be set automatically
    };

    const token = await issueJWT("HS512", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Audience Claims", async () => {
    const payload: JWTPayload = {
      sub: "user456",
      iss: "auth.example.com",
      aud: ["api.example.com", "web.example.com"],
      exp: Math.floor(Date.now() / 1000) + 1800,
    };

    const token = await issueJWT("HS384", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Single Audience", async () => {
    const payload: JWTPayload = {
      sub: "user789",
      aud: "api.example.com",
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Empty Payload", async () => {
    const payload: JWTPayload = {};

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Long Secret", async () => {
    const longSecret = "a".repeat(1000);
    const payload: JWTPayload = { sub: "test" };

    const token = await issueJWT("HS256", payload, longSecret);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Unicode in Payload", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      name: "测试用户 🌍",
      message: "Hello 世界",
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Numeric Claims", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      version: 1.5,
      count: 42,
      pi: 3.14159,
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Boolean Claims", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      isAdmin: true,
      isActive: false,
      emailVerified: true,
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Error Handling", async () => {
    const payload: JWTPayload = { sub: "test" };

    // Empty secret
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", payload, "");
      },
      JWTError,
      "Secret must be a non-empty string",
    );

    // Non-string secret
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", payload, null as any);
      },
      JWTError,
      "Secret must be a non-empty string",
    );

    // Invalid payload
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", null as any, TEST_SECRET);
      },
      JWTError,
      "Payload must be an object",
    );

    // Non-object payload
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", "invalid" as any, TEST_SECRET);
      },
      JWTError,
      "Payload must be an object",
    );
  });

  await t.step("issueJWT - Invalid Claims Validation", async () => {
    // Invalid exp claim
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", { exp: "invalid" as any }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid iat claim
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", { iat: "invalid" as any }, TEST_SECRET);
      },
      JWTError,
    );

    // Invalid nbf claim
    await asserts.assertRejects(
      async () => {
        await issueJWT("HS256", { nbf: "invalid" as any }, TEST_SECRET);
      },
      JWTError,
    );
  });

  await t.step("issueJWT - Large Payload", async () => {
    const largePayload: JWTPayload = {
      sub: "user123",
      data: "x".repeat(10000),
    };

    const token = await issueJWT("HS256", largePayload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Nested Object Claims", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      profile: {
        name: "John Doe",
        email: "john@example.com",
        preferences: {
          theme: "dark",
          language: "en",
        },
      },
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });

  await t.step("issueJWT - Array Claims", async () => {
    const payload: JWTPayload = {
      sub: "user123",
      roles: ["admin", "user"],
      permissions: ["read", "write", "delete"],
      tags: [],
    };

    const token = await issueJWT("HS256", payload, TEST_SECRET);
    asserts.assertEquals(typeof token, "string");
  });
});
