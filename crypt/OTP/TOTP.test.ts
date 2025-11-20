import * as asserts from "$asserts";
import { type DigestAlgorithms, generateTOTP, verifyTOTP } from "./mod.ts";

Deno.test("crypt.TOTP", async (t) => {
  await t.step("TOTP - Check if the length is as specified", async () => {
    for (let i = 6; i <= 40; i++) {
      asserts.assertEquals(
        (await generateTOTP("12345678901234567890", Date.now(), 30, i)).length,
        i,
      );
    }
  });

  await t.step(
    "TOTP - Verify implementation against known values",
    async () => {
      const values: Record<DigestAlgorithms, Record<number, string>> = {
        "SHA-1": {
          59000: "287082",
          1111111109000: "081804",
          1111111111000: "050471",
          1234567890000: "005924",
          2000000000000: "279037",
          20000000000000: "353130",
        },
        "SHA-256": {
          59000: "46119246",
          1111111109000: "68084774",
          1111111111000: "67062674",
          1234567890000: "91819424",
          2000000000000: "90698825",
          20000000000000: "77737706",
        },
        "SHA-384": {
          59000: "03101971",
          1111111109000: "67322300",
          1111111111000: "75083366",
          1234567890000: "16696097",
          2000000000000: "01776484",
          20000000000000: "78055951",
        },
        "SHA-512": {
          59000: "90693936",
          1111111109000: "25091201",
          1111111111000: "99943326",
          1234567890000: "93441116",
          2000000000000: "38618901",
          20000000000000: "47863826",
        },
      };

      for (const [algo, results] of Object.entries(values)) {
        let key = "";
        let length;
        switch (algo) {
          case "SHA-256":
            key = "12345678901234567890123456789012";
            length = 8;
            break;
          case "SHA-512":
          case "SHA-384":
            key =
              "1234567890123456789012345678901234567890123456789012345678901234";
            length = 8;
            break;
          default:
            key = "12345678901234567890";
            length = 6;
        }
        for (const [k, v] of Object.entries(results)) {
          asserts.assertEquals(
            await generateTOTP(
              key,
              parseInt(k),
              30,
              length,
              algo as DigestAlgorithms,
            ),
            v,
          );
        }
      }
    },
  );

  await t.step("TOTP - Error Handling", async () => {
    await asserts.assertRejects(
      () => generateTOTP("dfdfsd", Date.now(), 30, 6, "SHA-1"),
      Error,
      "Secret key should be at least 16 characters long",
    );

    asserts.assertThrows(
      () => generateTOTP("12345678901234567890", Date.now(), 0, 6, "SHA-1"),
      Error,
      "Time period must be at least 1 second",
    );

    await asserts.assertRejects(
      () => generateTOTP("12345678901234567890", Date.now(), 30, 0, "SHA-1"),
      Error,
      "OTP length must be a non-negative integer",
    );
  });

  await t.step("TOTP - Different Periods", async () => {
    const key = "12345678901234567890";
    const epoch = Date.now();

    const totp30 = await generateTOTP(key, epoch, 30, 6);
    const totp60 = await generateTOTP(key, epoch, 60, 6);

    // Different periods should generally produce different OTPs
    // (unless we're at a time boundary)
    asserts.assertEquals(typeof totp30, "string");
    asserts.assertEquals(typeof totp60, "string");
    asserts.assertEquals(totp30.length, 6);
    asserts.assertEquals(totp60.length, 6);
  });

  await t.step("TOTP - Different Key Lengths", async () => {
    const epoch = Date.now();
    const keys = [
      "1234567890123456", // 16 chars
      "12345678901234567890", // 20 chars
      "123456789012345678901234567890", // 30 chars
    ];

    for (const key of keys) {
      const totp = await generateTOTP(key, epoch, 30, 6);
      asserts.assertEquals(typeof totp, "string");
      asserts.assertEquals(totp.length, 6);
    }
  });

  await t.step("TOTP - Binary Key Support", async () => {
    const binaryKey = new Uint8Array([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
    ]);
    const epoch = Date.now();

    const totp = await generateTOTP(binaryKey, epoch, 30, 6);
    asserts.assertEquals(typeof totp, "string");
    asserts.assertEquals(totp.length, 6);
  });

  await t.step("TOTP - Consistency", async () => {
    const key = "12345678901234567890";
    const epoch = Date.now();

    const totp1 = await generateTOTP(key, epoch, 30, 6);
    const totp2 = await generateTOTP(key, epoch, 30, 6);

    asserts.assertEquals(totp1, totp2);
  });

  await t.step("TOTP - Default Parameters", async () => {
    const key = "12345678901234567890";

    const totp = await generateTOTP(key);
    asserts.assertEquals(typeof totp, "string");
    asserts.assertEquals(totp.length, 6); // Default length
  });

  await t.step("verifyTOTP - Valid OTPs", async () => {
    const key = "12345678901234567890";
    const epoch = Date.now();

    const totp = await generateTOTP(key, epoch, 30, 6);
    const isValid = await verifyTOTP(totp, key, 1, epoch, 30, 6);

    asserts.assertEquals(isValid, true);
  });

  await t.step("verifyTOTP - Invalid OTPs", async () => {
    const key = "12345678901234567890";
    const epoch = Date.now();

    const isValid = await verifyTOTP("000000", key, 1, epoch, 30, 6);
    asserts.assertEquals(isValid, false);
  });

  await t.step("verifyTOTP - Time Window", async () => {
    const key = "12345678901234567890";
    const epoch = Date.now();

    const totp = await generateTOTP(key, epoch, 30, 6);

    // Should be valid within window
    const isValidNow = await verifyTOTP(totp, key, 1, epoch, 30, 6);
    asserts.assertEquals(isValidNow, true);

    // Should be valid in previous time step (within window)
    const isValidPrev = await verifyTOTP(totp, key, 1, epoch - 30000, 30, 6);
    asserts.assertEquals(isValidPrev, true);
  });

  await t.step("verifyTOTP - Error Handling", async () => {
    const key = "12345678901234567890";

    await asserts.assertRejects(
      () => verifyTOTP("123456", key, 1, Date.now(), 0, 6),
      Error,
      "Time period must be at least 1 second",
    );

    await asserts.assertRejects(
      () => verifyTOTP("123456", key, -1, Date.now(), 30, 6),
      Error,
      "Window must be a non-negative integer",
    );

    // Invalid OTP format
    const isValid1 = await verifyTOTP("12a456", key, 1, Date.now(), 30, 6);
    asserts.assertEquals(isValid1, false);

    // Wrong length
    const isValid2 = await verifyTOTP("12345", key, 1, Date.now(), 30, 6);
    asserts.assertEquals(isValid2, false);
  });

  await t.step("verifyTOTP - All Algorithms", async () => {
    const algorithms: DigestAlgorithms[] = [
      "SHA-1",
      "SHA-256",
      "SHA-384",
      "SHA-512",
    ];
    const key = "12345678901234567890123456789012";
    const epoch = Date.now();

    for (const algo of algorithms) {
      const totp = await generateTOTP(key, epoch, 30, 6, algo);
      const isValid = await verifyTOTP(totp, key, 1, epoch, 30, 6, algo);
      asserts.assertEquals(isValid, true);
    }
  });
});
