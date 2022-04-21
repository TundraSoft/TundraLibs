import { Options } from "./mod.ts";
import { assertEquals, assertNotEquals } from "../dev_dependencies.ts";

interface iA {
  NaMe: string;
  age: number;
  address: {
    line1: string;
    line2: string;
    mailing: boolean;
  };
  optionalItem?: Array<string>;
}

const optionSet1: iA = {
  NaMe: "Test Name",
  age: 39,
  address: {
    line1: "Somewhere in the globe",
    line2: "You have no idea where",
    mailing: false,
  },
};

const optionSet2: iA = {
  NaMe: "Test2 Name",
  age: 50,
  address: {
    line1: "Somewhere on earth",
    line2: "You dont need to know",
    mailing: true,
  },
  optionalItem: ["One", "Two"],
};

class Test extends Options<iA> {
  constructor(options: iA, enableEdit: boolean = true) {
    super(options, {}, enableEdit);
  }

  returnMailingDetails() {
    return this._options.address;
  }

  getOption(name: keyof iA): any {
    return this._getOption(name);
  }
  setOption(name: keyof iA, value: any) {
    this._setOption(name, value);
  }
  setOptions(options: iA) {
    this._setOptions(options);
  }
}

Deno.test({
  name: "Get from public method",
  fn(): void {
    let a: Test = new Test(optionSet1);
    assertEquals("Test Name", a.getOption("NaMe"));
    assertEquals(39, a.getOption("age"));
  },
});

Deno.test({
  name: "Get internally",
  fn(): void {
    let a: Test = new Test(optionSet1);
    assertEquals({
      line1: "Somewhere in the globe",
      line2: "You have no idea where",
      mailing: false,
    }, a.returnMailingDetails());
  },
});

Deno.test({
  name: "Editing Options",
  fn(): void {
    let a: Test = new Test(optionSet1, true);
    assertEquals({
      line1: "Somewhere in the globe",
      line2: "You have no idea where",
      mailing: false,
    }, a.getOption("address"));
    a.setOptions(optionSet2);
    assertEquals({
      line1: "Somewhere on earth",
      line2: "You dont need to know",
      mailing: true,
    }, a.getOption("address"));
  },
});

Deno.test({
  name: "Check disabled option editing",
  fn(): void {
    let b: Test = new Test(optionSet1);
    assertEquals({
      line1: "Somewhere in the globe",
      line2: "You have no idea where",
      mailing: false,
    }, b.returnMailingDetails());
    b.setOptions(optionSet2);
    assertNotEquals({
      line1: "Somewhere in the globe",
      line2: "You have no idea where",
      mailing: false,
    }, b.returnMailingDetails());
  },
});

Deno.test({
  name: "Check optional value",
  fn(): void {
    let a: Test = new Test(optionSet1);
    assertEquals(undefined, a.getOption("optionalItem"));
  },
});

Deno.test({
  name: "Check array value",
  fn(): void {
    let b: Test = new Test(optionSet2);
    assertEquals(["One", "Two"], b.getOption("optionalItem"));
  },
});
