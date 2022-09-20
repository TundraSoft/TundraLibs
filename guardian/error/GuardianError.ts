import { ObjectPath } from "../types/mod.ts";
import type { ErrorFormat } from "../types/mod.ts";
export class GuardianError extends Error {
  #path?: ObjectPath;
  #message: string;
  #children: GuardianError[];

  constructor(message: string, path?: ObjectPath, children?: GuardianError[]) {
    super(message);
    this.#path = path;
    this.#message = message;
    this.#children = children || [];
    Object.setPrototypeOf(this, GuardianError.prototype);
  }

  public get path(): string | undefined {
    return this.#path?.join(".");
  }

  public get message(): string {
    return this.#message;
  }

  public get children(): GuardianError[] {
    return this.#children;
  }

  public toJSON(): ErrorFormat {
    const err: ErrorFormat = {
      message: this.message,
    };
    if (this.path) {
      err["path"] = this.path;
    }
    if (this.children.length > 0) {
      err["children"] = this.children.map((e) => e.toJSON());
    }
    return err;
  }
}
