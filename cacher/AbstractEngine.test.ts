import * as asserts from "$asserts";
import { AbstractEngine } from "./AbstractEngine.ts";
import { CacherEngineError } from "./errors/mod.ts";
import type { CacherOptions, CacheValue } from "./types/mod.ts";

/**
 * Test implementation of AbstractEngine for comprehensive testing
 */
class TestEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = "TEST";

  private readonly _storage = new Map<string, CacheValue>();
  private _shouldFailInit = false;
  private _shouldFailFinalize = false;
  private _initCallCount = 0;
  private _finalizeCallCount = 0;

  // Test helpers
  setFailInit(shouldFail: boolean) {
    this._shouldFailInit = shouldFail;
  }

  setFailFinalize(shouldFail: boolean) {
    this._shouldFailFinalize = shouldFail;
  }

  getInitCallCount(): number {
    return this._initCallCount;
  }

  getFinalizeCallCount(): number {
    return this._finalizeCallCount;
  }

  getStorageSize(): number {
    return this._storage.size;
  }

  getRawStorage(): Map<string, CacheValue> {
    return this._storage;
  }

  public override async init(): Promise<void> {
    this._initCallCount++;
    if (this._shouldFailInit) {
      throw new Error("Test init failure");
    }
  }

  public override async finalize(): Promise<void> {
    this._finalizeCallCount++;
    if (this._shouldFailFinalize) {
      throw new Error("Test finalize failure");
    }
    this._storage.clear();
  }

  protected override async _set(key: string, value: CacheValue): Promise<void> {
    this._storage.set(key, value);
  }

  protected override async _get(key: string): Promise<CacheValue | undefined> {
    const value = this._storage.get(key);

    // Simulate expiry checking
    if (value && value.expiry > 0) {
      // For testing purposes, we don't do actual time-based expiry
      // The memory engine handles this properly
    }

    return value;
  }

  protected override async _has(key: string): Promise<boolean> {
    return this._storage.has(key);
  }

  protected override async _delete(key: string): Promise<void> {
    this._storage.delete(key);
  }

  protected override async _clear(): Promise<void> {
    this._storage.clear();
  }
}

/**
 * Synchronous test engine to test sync abstract methods
 */
class SyncTestEngine extends AbstractEngine<CacherOptions> {
  public readonly Engine = "SYNC_TEST";

  private readonly _storage = new Map<string, CacheValue>();

  protected _set(key: string, value: CacheValue): void {
    this._storage.set(key, value);
  }

  protected _get(key: string): CacheValue | undefined {
    return this._storage.get(key);
  }

  protected _has(key: string): boolean {
    return this._storage.has(key);
  }

  protected _delete(key: string): void {
    this._storage.delete(key);
  }

  protected _clear(): void {
    this._storage.clear();
  }
}

Deno.test("cacher.AbstractEngine", async (t) => {
  await t.step("constructor and initialization", async (t) => {
    await t.step(
      "should create an instance with proper name and options",
      () => {
        const engine = new TestEngine("test-cache", { defaultExpiry: 600 });

        asserts.assertEquals(engine.name, "test-cache");
        asserts.assertEquals(engine.Engine, "TEST");
        asserts.assertEquals(engine.getOption("defaultExpiry"), 600);
      },
    );

    await t.step("should trim whitespace from name", () => {
      const engine = new TestEngine("  test-cache  ", {});
      asserts.assertEquals(engine.name, "test-cache");
    });

    await t.step("should use default options when not provided", () => {
      const engine = new TestEngine("test", {});
      asserts.assertEquals(engine.getOption("defaultExpiry"), 300);
    });

    await t.step("should validate defaultExpiry option", () => {
      asserts.assertThrows(
        () => new TestEngine("test", { defaultExpiry: -1 }),
        CacherEngineError,
        "Configuration value for defaultExpiry is invalid",
      );

      asserts.assertThrows(
        () => new TestEngine("test", { defaultExpiry: NaN }),
        CacherEngineError,
        "Configuration value for defaultExpiry is invalid",
      );

      asserts.assertThrows(
        () => new TestEngine("test", { defaultExpiry: "invalid" as any }),
        CacherEngineError,
        "Configuration value for defaultExpiry is invalid",
      );
    });

    await t.step("should accept zero as valid defaultExpiry", () => {
      const engine = new TestEngine("test", { defaultExpiry: 0 });
      asserts.assertEquals(engine.getOption("defaultExpiry"), 0);
    });
  });

  await t.step("initialization and finalization", async (t) => {
    await t.step("should call init only when needed", async () => {
      const engine = new TestEngine("test", {});

      asserts.assertEquals(engine.getInitCallCount(), 0);

      // Each public method should call init once
      await engine.set("key1", "value1");
      await engine.get("key1");
      await engine.has("key1");
      await engine.delete("key1");
      await engine.clear();

      // Total should be 5 calls, one for each method
      asserts.assertEquals(engine.getInitCallCount(), 5);
    });

    await t.step("should handle init failures gracefully", async () => {
      const engine = new TestEngine("test", {});
      engine.setFailInit(true);

      await asserts.assertRejects(
        () => engine.set("key1", "value1"),
        Error,
        "Test init failure",
      );
    });

    await t.step("should handle finalize calls", async () => {
      const engine = new TestEngine("test", {});

      asserts.assertEquals(engine.getFinalizeCallCount(), 0);

      await engine.finalize();
      asserts.assertEquals(engine.getFinalizeCallCount(), 1);
    });

    await t.step("should handle finalize failures gracefully", async () => {
      const engine = new TestEngine("test", {});
      engine.setFailFinalize(true);

      await asserts.assertRejects(
        () => engine.finalize(),
        Error,
        "Test finalize failure",
      );
    });
  });

  await t.step("key normalization", async (t) => {
    await t.step("should normalize keys correctly", async () => {
      const engine = new TestEngine("test-cache", {});

      // Set with various key formats
      await engine.set("  KEY1  ", "value1");
      await engine.set("Key2", "value2");
      await engine.set("key3", "value3");

      // All should be accessible with normalized keys
      asserts.assertEquals(await engine.get("key1"), "value1");
      asserts.assertEquals(await engine.get("KEY2"), "value2");
      asserts.assertEquals(await engine.get("  key3  "), "value3");

      // Check raw storage to verify normalization
      const storage = engine.getRawStorage();
      asserts.assert(storage.has("test-cache:key1"));
      asserts.assert(storage.has("test-cache:key2"));
      asserts.assert(storage.has("test-cache:key3"));
    });

    await t.step("should add namespace prefix to keys", async () => {
      const engine = new TestEngine("my-namespace", {});

      await engine.set("testkey", "value");

      const storage = engine.getRawStorage();
      asserts.assert(storage.has("my-namespace:testkey"));
      asserts.assertFalse(storage.has("testkey"));
    });
  });

  await t.step("set operation", async (t) => {
    await t.step("should store values with default options", async () => {
      const engine = new TestEngine("test", { defaultExpiry: 300 });

      await engine.set("key1", "string-value");
      await engine.set("key2", { complex: "object", num: 42 });
      await engine.set("key3", [1, 2, 3]);
      await engine.set("key4", 123);
      await engine.set("key5", true);
      await engine.set("key6", null);

      asserts.assertEquals(await engine.get("key1"), "string-value");
      asserts.assertEquals(await engine.get("key2"), {
        complex: "object",
        num: 42,
      });
      asserts.assertEquals(await engine.get("key3"), [1, 2, 3]);
      asserts.assertEquals(await engine.get("key4"), 123);
      asserts.assertEquals(await engine.get("key5"), true);
      asserts.assertEquals(await engine.get("key6"), null);
    });

    await t.step("should store values with custom expiry", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1", { expiry: 600 });

      const storage = engine.getRawStorage();
      const stored = storage.get("test:key1");
      asserts.assert(stored);
      asserts.assertEquals(stored.expiry, 600);
      asserts.assertEquals(stored.window, false);
    });

    await t.step("should store values with window mode", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1", { window: true });

      const storage = engine.getRawStorage();
      const stored = storage.get("test:key1");
      asserts.assert(stored);
      asserts.assertEquals(stored.window, true);
    });

    await t.step("should validate expiry values", async () => {
      const engine = new TestEngine("test", {});

      await asserts.assertRejects(
        () => engine.set("key1", "value1", { expiry: -1 }),
        CacherEngineError,
        "Invalid parameters for operation SET",
      );

      await asserts.assertRejects(
        () => engine.set("key1", "value1", { expiry: NaN }),
        CacherEngineError,
        "Invalid parameters for operation SET",
      );

      await asserts.assertRejects(
        () => engine.set("key1", "value1", { expiry: "invalid" as any }),
        CacherEngineError,
        "Invalid parameters for operation SET",
      );
    });

    await t.step("should accept zero expiry", async () => {
      const engine = new TestEngine("test", {});

      // Should not throw
      await engine.set("key1", "value1", { expiry: 0 });

      const storage = engine.getRawStorage();
      const stored = storage.get("test:key1");
      asserts.assert(stored);
      asserts.assertEquals(stored.expiry, 0);
    });

    await t.step("should serialize values to JSON", async () => {
      const engine = new TestEngine("test", {});

      const complexValue = {
        string: "test",
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { deep: { value: "nested" } },
      };

      await engine.set("complex", complexValue);

      const storage = engine.getRawStorage();
      const stored = storage.get("test:complex");
      asserts.assert(stored);
      asserts.assertEquals(typeof stored.data, "string");
      asserts.assertEquals(JSON.parse(stored.data), complexValue);
    });
  });

  await t.step("get operation", async (t) => {
    await t.step("should retrieve stored values", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1");
      await engine.set("key2", { obj: "value" });

      asserts.assertEquals(await engine.get("key1"), "value1");
      asserts.assertEquals(await engine.get("key2"), { obj: "value" });
    });

    await t.step("should return undefined for non-existent keys", async () => {
      const engine = new TestEngine("test", {});

      asserts.assertEquals(await engine.get("nonexistent"), undefined);
    });

    await t.step("should deserialize JSON values", async () => {
      const engine = new TestEngine("test", {});

      const originalValue = { complex: "object", array: [1, 2, 3], num: 42 };
      await engine.set("key1", originalValue);

      const retrieved = await engine.get("key1");
      asserts.assertEquals(retrieved, originalValue);
    });
  });

  await t.step("has operation", async (t) => {
    await t.step("should return true for existing keys", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1");

      asserts.assertEquals(await engine.has("key1"), true);
    });

    await t.step("should return false for non-existent keys", async () => {
      const engine = new TestEngine("test", {});

      asserts.assertEquals(await engine.has("nonexistent"), false);
    });

    await t.step("should normalize keys for checking", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("  KEY1  ", "value1");

      asserts.assertEquals(await engine.has("key1"), true);
      asserts.assertEquals(await engine.has("KEY1"), true);
      asserts.assertEquals(await engine.has("  key1  "), true);
    });
  });

  await t.step("delete operation", async (t) => {
    await t.step("should delete existing keys", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1");
      asserts.assertEquals(await engine.has("key1"), true);

      await engine.delete("key1");
      asserts.assertEquals(await engine.has("key1"), false);
      asserts.assertEquals(await engine.get("key1"), undefined);
    });

    await t.step("should handle deletion of non-existent keys", async () => {
      const engine = new TestEngine("test", {});

      // Should not throw
      await engine.delete("nonexistent");
    });

    await t.step("should normalize keys for deletion", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("  KEY1  ", "value1");
      await engine.delete("key1");

      asserts.assertEquals(await engine.has("KEY1"), false);
    });
  });

  await t.step("clear operation", async (t) => {
    await t.step("should clear all keys", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("key1", "value1");
      await engine.set("key2", "value2");
      await engine.set("key3", "value3");

      asserts.assertEquals(engine.getStorageSize(), 3);

      await engine.clear();

      asserts.assertEquals(engine.getStorageSize(), 0);
      asserts.assertEquals(await engine.has("key1"), false);
      asserts.assertEquals(await engine.has("key2"), false);
      asserts.assertEquals(await engine.has("key3"), false);
    });

    await t.step("should handle clearing empty cache", async () => {
      const engine = new TestEngine("test", {});

      // Should not throw
      await engine.clear();
      asserts.assertEquals(engine.getStorageSize(), 0);
    });
  });

  await t.step("synchronous engine support", async (t) => {
    await t.step("should work with synchronous implementations", async () => {
      const engine = new SyncTestEngine("sync-test", {});

      await engine.set("key1", "value1");
      asserts.assertEquals(await engine.get("key1"), "value1");
      asserts.assertEquals(await engine.has("key1"), true);

      await engine.delete("key1");
      asserts.assertEquals(await engine.has("key1"), false);

      await engine.set("key2", "value2");
      await engine.clear();
      asserts.assertEquals(await engine.has("key2"), false);
    });
  });

  await t.step("expiry validation", async (t) => {
    await t.step(
      "should validate expiry parameter types correctly",
      async () => {
        const engine = new TestEngine("test", {});

        // Valid expiry values
        await engine.set("key1", "value", { expiry: 0 });
        await engine.set("key2", "value", { expiry: 300 });
        await engine.set("key3", "value", { expiry: 3600.5 }); // decimal should work

        // These should be valid in current implementation
        await engine.set("key4", "value", { expiry: Infinity });

        // Invalid expiry values should throw
        await asserts.assertRejects(
          () => engine.set("key5", "value", { expiry: -0.1 }),
          CacherEngineError,
        );

        await asserts.assertRejects(
          () => engine.set("key6", "value", { expiry: -Infinity }),
          CacherEngineError,
        );
      },
    );
  });

  await t.step("option processing", async (t) => {
    await t.step(
      "should process defaultExpiry option correctly in _processOption",
      () => {
        const engine = new TestEngine("test", { defaultExpiry: 600 });
        asserts.assertEquals(engine.getOption("defaultExpiry"), 600);

        // Test with undefined (should get default)
        const engine2 = new TestEngine("test2", {});
        asserts.assertEquals(engine2.getOption("defaultExpiry"), 300);
      },
    );
  });

  await t.step("edge cases and error handling", async (t) => {
    await t.step(
      "should handle undefined and null values correctly",
      async () => {
        const engine = new TestEngine("test", {});

        await engine.set("null-key", null);

        // null should be retrievable
        asserts.assertEquals(await engine.get("null-key"), null);

        // undefined becomes 'undefined' string when JSON.stringify'd, but causes parse error
        // This is expected behavior - undefined is not valid JSON
        await engine.set("undefined-key", undefined);
        await asserts.assertRejects(
          () => engine.get("undefined-key"),
          SyntaxError,
          "not valid JSON",
        );
      },
    );

    await t.step("should handle empty string keys", async () => {
      const engine = new TestEngine("test", {});

      await engine.set("", "empty-key-value");
      asserts.assertEquals(await engine.get(""), "empty-key-value");
    });

    await t.step("should handle very long keys", async () => {
      const engine = new TestEngine("test", {});
      const longKey = "x".repeat(1000);

      await engine.set(longKey, "long-key-value");
      asserts.assertEquals(await engine.get(longKey), "long-key-value");
    });

    await t.step("should handle special characters in keys", async () => {
      const engine = new TestEngine("test", {});
      const specialKey =
        "key:with!@#$%^&*()_+-={}[]|\\:\";'<>?,./special~chars";

      await engine.set(specialKey, "special-value");
      asserts.assertEquals(await engine.get(specialKey), "special-value");
    });
  });
});
