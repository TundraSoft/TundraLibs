import type { FunctionParameters, ObjectPath, PathError } from "./types.ts";

export type ErrorLike<P extends FunctionParameters = never> =
  | string
  | ValidationError
  | ((...args: P) => string | ValidationError);

export type ErrorList = {
  message: string;
  errors: [
    {
      path: ObjectPath;
      error: ErrorList;
    },
  ];
};

export class ValidationError extends Error {
  public path?: ObjectPath;
  public errors?: PathError[];

  constructor(message: string, errors?: PathError[]) {
    super(message);
    this.errors = errors;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  public toJSON?(): Record<string, unknown> {
    console.log(JSON.stringify(this.errors));
    return {
      message: this.message,
      errors: this.errors?.map(({ path, error }) => ({
        path,
        // error: ValidationError.prototype.toJSON?.apply(error) || error,
        error: ValidationError.prototype.toJSON?.apply(error),
      })),
    };
  }
}

ValidationError.prototype.name = "ValidationError";
