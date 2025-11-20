import * as asserts from "$asserts";
import { JWTError, type JWTErrorCode, JWTErrorCodes } from "./Error.ts";

Deno.test("crypt.JWT.Error", async (t) => {
  await t.step("JWTError - Basic error creation", () => {
    const error = new JWTError("EXPIRED_TOKEN");

    asserts.assertInstanceOf(error, JWTError);
    asserts.assertEquals(error.name, "JWTError");
    asserts.assertEquals(error.message, "JWT token is expired");
    asserts.assertEquals(error.context.code, "EXPIRED_TOKEN");
  });

  await t.step("JWTError - Error with cause message", () => {
    const error = new JWTError("INVALID_JWT", {
      causeMessage: "Malformed header structure",
    });

    asserts.assertEquals(
      error.message,
      "JWT token is invalid - Malformed header structure",
    );
    asserts.assertEquals(error.context.code, "INVALID_JWT");
    asserts.assertEquals(
      error.context.causeMessage,
      "Malformed header structure",
    );
  });

  await t.step("JWTError - Error with template interpolation", () => {
    const error = new JWTError("INVALID_SIGNATURE", {
      causeMessage: "HMAC verification failed",
    });

    asserts.assertEquals(
      error.message,
      "JWT signature verification failed - HMAC verification failed",
    );
    asserts.assertEquals(
      error.context.causeMessage,
      "HMAC verification failed",
    );
  });

  await t.step("JWTError - Error with header context", () => {
    const header = { alg: "HS256", typ: "JWT" };
    const error = new JWTError("INVALID_HEADER", {
      causeMessage: "Missing required field",
      header,
    });

    asserts.assertEquals(error.context.header, header);
    asserts.assertEquals(error.context.causeMessage, "Missing required field");
  });

  await t.step("JWTError - Error with payload context", () => {
    const payload = { sub: "user123", exp: 1234567890 };
    const error = new JWTError("INVALID_PAYLOAD", {
      causeMessage: "Invalid expiration time",
      payload,
    });

    asserts.assertEquals(error.context.payload, payload);
    asserts.assertEquals(error.context.causeMessage, "Invalid expiration time");
  });

  await t.step("JWTError - Error with cause chain", () => {
    const originalError = new Error("Original network error");
    const error = new JWTError("UNKNOWN_ERROR", {
      causeMessage: "Network failure during verification",
    }, originalError);

    asserts.assertEquals(error.cause, originalError);
    asserts.assertEquals(
      error.context.causeMessage,
      "Network failure during verification",
    );
  });

  await t.step("JWTError - Error with additional metadata", () => {
    const error = new JWTError("UNSUPPORTED_ALGORITHM", {
      causeMessage: "RS256 not supported",
      algorithm: "RS256",
      supportedAlgorithms: ["HS256", "HS384", "HS512"],
    });

    asserts.assertEquals(error.context.algorithm, "RS256");
    asserts.assertEquals(error.context.supportedAlgorithms, [
      "HS256",
      "HS384",
      "HS512",
    ]);
  });

  await t.step("JWTError - Unknown error code mapping", () => {
    const error = new JWTError("UNKNOWN_CODE" as JWTErrorCode);

    asserts.assertEquals(error.context.code, "INVALID_JWT");
    asserts.assertEquals(error.context.originalCode, "UNKNOWN_CODE");
    asserts.assert(error.message.includes("JWT token is invalid"));
  });

  await t.step("JWTError - Template interpolation without causeMessage", () => {
    const error = new JWTError("INVALID_SIGNATURE");

    // Should contain the template variable since no causeMessage was provided
    asserts.assert(error.message.includes("${causeMessage}"));
  });

  await t.step("JWTError - All error codes coverage", () => {
    const codes: JWTErrorCode[] = [
      "EXPIRED_TOKEN",
      "NOT_ACTIVE",
      "INVALID_JWT",
      "INVALID_SECRET",
      "INVALID_PAYLOAD",
      "INVALID_HEADER",
      "INVALID_SIGNATURE",
      "INVALID_FORMAT",
      "UNSUPPORTED_ALGORITHM",
      "INVALID_CLAIMS",
      "MAX_AGE_EXCEEDED",
      "UNKNOWN_ERROR",
    ];

    for (const code of codes) {
      const error = new JWTError(code, { causeMessage: "Test error" });
      asserts.assertEquals(error.context.code, code);
      asserts.assert(JWTErrorCodes[code]);
      asserts.assertInstanceOf(error, JWTError);
    }
  });

  await t.step("JWTError - Error codes have corresponding messages", () => {
    const codes = Object.keys(JWTErrorCodes) as JWTErrorCode[];

    for (const code of codes) {
      const message = JWTErrorCodes[code];
      asserts.assert(typeof message === "string");
      asserts.assert(message.length > 0);
    }
  });

  await t.step("JWTError - Template variables in error messages", () => {
    // Test that messages with templates work correctly
    const templatedCodes: JWTErrorCode[] = [
      "INVALID_JWT",
      "INVALID_SECRET",
      "INVALID_PAYLOAD",
      "INVALID_HEADER",
      "INVALID_SIGNATURE",
      "INVALID_FORMAT",
      "UNSUPPORTED_ALGORITHM",
      "INVALID_CLAIMS",
      "UNKNOWN_ERROR",
    ];

    for (const code of templatedCodes) {
      const message = JWTErrorCodes[code];
      if (message.includes("${causeMessage}")) {
        const error = new JWTError(code, { causeMessage: "Test cause" });
        asserts.assert(error.message.includes("Test cause"));
        asserts.assert(!error.message.includes("${causeMessage}"));
      }
    }
  });

  await t.step("JWTError - Non-templated error messages", () => {
    const nonTemplatedCodes: JWTErrorCode[] = [
      "EXPIRED_TOKEN",
      "NOT_ACTIVE",
      "MAX_AGE_EXCEEDED",
    ];

    for (const code of nonTemplatedCodes) {
      const error = new JWTError(code);
      const expectedMessage = JWTErrorCodes[code];
      asserts.assertEquals(error.message, expectedMessage);
    }
  });

  await t.step("JWTError - Complex metadata object", () => {
    const complexMeta = {
      causeMessage: "Complex validation failure",
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "user", exp: Date.now() },
      customField: "custom value",
      nestedObject: { key: "value" },
      arrayField: [1, 2, 3],
    };

    const error = new JWTError("INVALID_CLAIMS", complexMeta);

    asserts.assertEquals(error.context.header, complexMeta.header);
    asserts.assertEquals(error.context.payload, complexMeta.payload);
    asserts.assertEquals(error.context.customField, complexMeta.customField);
    asserts.assertEquals(error.context.nestedObject, complexMeta.nestedObject);
    asserts.assertEquals(error.context.arrayField, complexMeta.arrayField);
  });
});
