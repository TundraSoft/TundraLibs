import { Options } from "./mod.ts";
import type { OptionsKey, OptionsType } from "./mod.ts";
import { assertEquals, assertNotEquals } from "../dev_dependencies.ts";

//#region Typed Options
type iTypedOptions = {
  value1: string;
  value2: number;
  value3: {
    value31: boolean;
  };
  value44?: Array<string>;
};
class TypedOption extends Options<iTypedOptions> {
  constructor(
    options: NonNullable<iTypedOptions> | Partial<iTypedOptions>,
    defaults?: Partial<iTypedOptions>,
  ) {
    super(options, defaults);
  }

  // deno-lint-ignore no-explicit-any
  public setOptions(name: keyof iTypedOptions, value: any) {
    this._setOption(name, value);
  }

  public getOption(name: keyof iTypedOptions): unknown {
    return this._getOption(name);
  }

  public getOptions() {
    return this._options;
  }

  public hasOption(name: string): boolean {
    return this._hasOption(name as keyof iTypedOptions);
  }
}

/**
 * Check if option is initialized correctly (Typed)
 */
Deno.test({
  name: "Check if option is initialized correctly (Typed)",
  fn(): void {
    const opt: iTypedOptions = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: TypedOption = new TypedOption(opt);
    assertEquals(a.getOptions(), opt);
  },
});

/**
 * Ensure set option is cloned and not referenced (Typed)
 */
Deno.test({
  name: "Ensure set option is cloned and not referenced (Typed)",
  fn(): void {
    const opt: iTypedOptions = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: TypedOption = new TypedOption(opt);
    opt.value1 = "Changed";
    assertNotEquals(a.getOptions(), opt);
  },
});

/**
 * Initialize with default value (Typed)
 */
Deno.test({
  name: "Initialize with default value (Typed)",
  fn(): void {
    const opt: Partial<iTypedOptions> = {
      value1: "Test Value",
      value2: 1,
    };
    const def: Partial<iTypedOptions> = {
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: TypedOption = new TypedOption(opt, def);
    assertEquals(a.getOptions(), { ...opt, ...def });
  },
});

/**
 * Check if config value exists (Typed)
 */
Deno.test({
  name: "Check if config value exists (Typed)",
  fn(): void {
    const opt: iTypedOptions = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: TypedOption = new TypedOption(opt);
    assertEquals(a.hasOption("value1"), true);
    assertEquals(a.hasOption("value32"), false);
  },
});
//#endregion Typed Options

//#region UnTyped Options
class UnTypedOption extends Options {
  constructor(options: OptionsType, defaults?: OptionsType) {
    super(options, defaults);
  }

  public setOptions(name: OptionsKey, value: unknown) {
    this._setOption(name, value);
  }

  public getOption(name: OptionsKey): unknown {
    return this._getOption(name);
  }

  public getOptions() {
    return this._options;
  }

  public hasOption(name: OptionsKey): boolean {
    return this._hasOption(name);
  }
}

/**
 * Check if option is initialized correctly (UnTyped)
 */
Deno.test({
  name: "Check if option is initialized correctly (UnTyped)",
  fn(): void {
    const opt = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: UnTypedOption = new UnTypedOption(opt);
    assertEquals(a.getOptions(), opt);
  },
});

/**
 * Ensure set option is cloned and not referenced (UnTyped)
 */
Deno.test({
  name: "Ensure set option is cloned and not referenced (UnTyped)",
  fn(): void {
    const opt = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: UnTypedOption = new UnTypedOption(opt);
    opt.value1 = "Changed";
    assertNotEquals(a.getOptions(), opt);
  },
});

/**
 * Initialize with default value (UnTyped)
 */
Deno.test({
  name: "Initialize with default value (UnTyped)",
  fn(): void {
    const opt = {
      value1: "Test Value",
      value2: 1,
    };
    const def = {
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: UnTypedOption = new UnTypedOption(opt, def);
    assertEquals(a.getOptions(), { ...opt, ...def });
  },
});

/**
 * Check if config value exists (UnTyped)
 */
Deno.test({
  name: "Check if config value exists (UnTyped)",
  fn(): void {
    const opt = {
      value1: "Test Value",
      value2: 1,
      value3: {
        value31: true,
      },
      value44: ["1", "2"],
    };
    const a: UnTypedOption = new UnTypedOption(opt);
    assertEquals(a.hasOption("value1"), true);
    assertEquals(a.hasOption("value32"), false);
  },
});
//#endregion UnTyped Options
