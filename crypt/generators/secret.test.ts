import {
  assertEquals,
  assertInstanceOf,
  assertMatch,
  assertThrows,
} from "$asserts";
import {
  generateAlphanumericSecret,
  generateBase64Secret,
  generateHexSecret,
  generatePassword,
  generateToken,
  secretGenerator,
} from "./secret.ts";

Deno.test("crypt.generators.secret", async (t) => {
  await t.step("Generate secret with default parameters", () => {
    const secret = secretGenerator(32) as string;
    assertEquals(typeof secret, "string");
    assertEquals(secret.length, 64); // 32 bytes = 64 hex characters
    assertMatch(secret, /^[0-9a-f]{64}$/); // should be all hex characters
  });

  await t.step("Generate secret with different lengths", () => {
    // Test common encryption key sizes
    const tests = [16, 24, 32, 48, 64]; // bytes

    for (const bytes of tests) {
      const secret = secretGenerator(bytes) as string;
      assertEquals(secret.length, bytes * 2); // Each byte becomes 2 hex chars
    }
  });

  await t.step("Generate secret with hex encoding", () => {
    const secret = secretGenerator(32, "HEX") as string;
    assertEquals(typeof secret, "string");
    assertEquals(secret.length, 64);
    assertMatch(secret, /^[0-9a-f]{64}$/);
  });

  await t.step("Generate secret with base64 encoding", () => {
    const secret = secretGenerator(32, "BASE64") as string;
    assertEquals(typeof secret, "string");
    // 32 bytes in base64 should be about 44 characters (with possible padding)
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  await t.step("Generate secret with prefix", () => {
    const prefix = "key:";
    const secret = secretGenerator(32, "HEX", prefix) as string;
    assertEquals(secret.startsWith(prefix), true);
    assertEquals(secret.length, prefix.length + 64);
  });

  await t.step("Throw error for invalid byteLength", () => {
    assertThrows(
      () => secretGenerator(0),
      Error,
      "byteLength must be a positive integer",
    );
    assertThrows(
      () => secretGenerator(-10),
      Error,
      "byteLength must be a positive integer",
    );
    assertThrows(
      () => secretGenerator(1.5),
      Error,
      "byteLength must be a positive integer",
    );
  });

  await t.step("Throw error for invalid encoding", () => {
    assertThrows(
      // deno-lint-ignore no-explicit-any
      () => secretGenerator(32, "invalid" as any),
      Error,
      'Invalid encoding. Must be "HEX", "BASE64", or "ALPHANUMERIC"',
    );
  });

  await t.step("Check for collisions in large sample", () => {
    const iterations = 1000; // Lower than keyGenerator test for speed
    const generatedSecrets = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      generatedSecrets.add(secretGenerator(16) as string);
    }

    // All secrets should be unique
    assertEquals(generatedSecrets.size, iterations);
  });

  await t.step("Generate secret with hyphen interval", () => {
    const secret = secretGenerator(16, "HEX", "", 4) as string;
    assertEquals(typeof secret, "string");
    assertEquals(secret.split("-").length, 8); // 32 hex chars / 4 = 8 groups
    assertMatch(secret, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    assertThrows(
      () => secretGenerator(16, "HEX", "", -1),
      Error,
      "hyphenInterval must be a non-negative integer",
    );
  });

  await t.step("Generate secret with alphanumeric encoding", () => {
    const secret = secretGenerator(16, "ALPHANUMERIC") as string;
    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[0-9a-zA-Z]+$/);
  });

  await t.step("Generate secret with options object", () => {
    const secret = secretGenerator({
      byteLength: 16,
      encoding: "HEX",
      prefix: "key-",
      hyphenInterval: 4,
      lowercase: true,
    }) as string;

    assertEquals(typeof secret, "string");
    assertEquals(secret.startsWith("key-"), true);
    assertMatch(secret, /^key-([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  });

  await t.step("Generate alphanumeric secret with lowercase option", () => {
    const secret = secretGenerator({
      byteLength: 16,
      encoding: "ALPHANUMERIC",
      lowercase: true,
    }) as string;

    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[0-9a-z]+$/);
  });
});

Deno.test("crypt.generators.secret - Convenience Functions", async (t) => {
  await t.step("generateHexSecret - basic functionality", () => {
    const secret = generateHexSecret(16);
    assertEquals(typeof secret, "string");
    assertEquals(secret.length, 32); // 16 bytes = 32 hex chars
    assertMatch(secret, /^[0-9a-f]{32}$/);
  });

  await t.step("generateHexSecret - with prefix and hyphens", () => {
    const secret = generateHexSecret(8, "key-", 4);
    assertEquals(secret.startsWith("key-"), true);
    assertMatch(
      secret,
      /^key-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/,
    );
  });

  await t.step("generateHexSecret - lowercase option", () => {
    const secret = generateHexSecret(16, "", 0, true);
    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[0-9a-f]{32}$/); // Should be lowercase
  });

  await t.step("generateBase64Secret - basic functionality", () => {
    const secret = generateBase64Secret(24);
    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[A-Za-z0-9+/]+=*$/);
  });

  await t.step("generateBase64Secret - with prefix", () => {
    const secret = generateBase64Secret(16, "sk-");
    assertEquals(secret.startsWith("sk-"), true);
    assertMatch(secret, /^sk-[A-Za-z0-9+/]+=*$/);
  });

  await t.step("generateBase64Secret - with hyphens", () => {
    const secret = generateBase64Secret(24, "", 8);
    assertEquals(typeof secret, "string");
    // Should contain hyphens for formatting
    assertEquals(secret.includes("-"), true);
  });

  await t.step("generateAlphanumericSecret - basic functionality", () => {
    const secret = generateAlphanumericSecret(16);
    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[0-9a-zA-Z]{16}$/);
  });

  await t.step("generateAlphanumericSecret - with formatting", () => {
    const secret = generateAlphanumericSecret(12, "", 4, true);
    assertEquals(typeof secret, "string");
    assertMatch(secret, /^[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/);
  });

  await t.step("generateToken - default parameters", () => {
    const token = generateToken();
    assertEquals(typeof token, "string");
    assertEquals(token.length, 64); // 32 bytes = 64 hex chars
    assertMatch(token, /^[0-9a-f]{64}$/); // Should be lowercase by default
  });

  await t.step("generateToken - with prefix", () => {
    const token = generateToken("api_");
    assertEquals(token.startsWith("api_"), true);
    assertEquals(token.length, 68); // 4 char prefix + 64 hex chars
    assertMatch(token, /^api_[0-9a-f]{64}$/);
  });

  await t.step("generateToken - uppercase option", () => {
    const token = generateToken("", false);
    assertEquals(typeof token, "string");
    assertEquals(token.length, 64);
    // Note: encodeHex produces lowercase by default, so lowercase=false just means "don't force lowercase"
    // The actual output is still lowercase from the encoding function
    assertMatch(token, /^[0-9a-f]{64}$/);
  });

  await t.step("generatePassword - default parameters", () => {
    const password = generatePassword();
    assertEquals(typeof password, "string");
    assertEquals(password.length, 16); // 16 byte length
    assertMatch(password, /^[0-9a-zA-Z]{16}$/);
  });

  await t.step("generatePassword - custom length", () => {
    const password = generatePassword(20);
    assertEquals(typeof password, "string");
    assertEquals(password.length, 20);
    assertMatch(password, /^[0-9a-zA-Z]{20}$/);
  });

  await t.step("generatePassword - with hyphens", () => {
    const password = generatePassword(16, true);
    assertEquals(typeof password, "string");
    assertEquals(password.includes("-"), true);
    assertMatch(
      password,
      /^[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}$/,
    );
  });

  await t.step("All convenience functions generate unique outputs", () => {
    const outputs = new Set([
      generateHexSecret(16),
      generateBase64Secret(16),
      generateAlphanumericSecret(16),
      generateToken(),
      generatePassword(),
    ]);

    // All should be unique
    assertEquals(outputs.size, 5);
  });
});
