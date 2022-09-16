import { FunctionParameters } from "./Function.ts";
import { ObjectPath } from "./Object.ts";
import { GuardianError } from "../error/mod.ts";

export type ErrorLike<P extends FunctionParameters = never> =
  | string
  | GuardianError
  | ((...args: P) => string | GuardianError);

export type ErrorFormat = {
  message: string;
  path?: string;
  children?: ErrorFormat[];
};

export type ErrorList = {
  message: string;
  errors: [
    {
      path: ObjectPath;
      error: ErrorList;
    },
  ];
};

export type PathError = {
  path: ObjectPath;
  error: Error;
};
