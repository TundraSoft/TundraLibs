import { nanoid } from "../nanoid/mod.ts";

export const Generators = {
  uuid: function (): string {
    return crypto.randomUUID();
  },

  nanoid: function (len: number): string {
    return nanoid(len);
  },

  unixTimestamp: function (): number {
    return Date.now();
  },
};
