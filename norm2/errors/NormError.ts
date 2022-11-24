import { ErrorCodes, ErrorMessages } from "./ErrorCodes.ts";
import { Dialects } from "../types/mod.ts";

export class NormError extends Error {
  #code: ErrorCodes;
  #configName: string;
  #dialect: Dialects;
  // This is the actual error message
  #rawMessage: string;

  constructor(
    code: ErrorCodes,
    message: string,
    configName: string,
    dialect: Dialects,
  ) {
    super(
      `[module='norm' code='${code}' configName='${configName}' dialect='${dialect}'] ${
        ErrorMessages[code]
      }`,
    );
    // super(message);
    this.#code = code;
    this.#configName = configName;
    this.#dialect = dialect;
    this.#rawMessage = message;
  }

  public get code(): ErrorCodes {
    return this.#code;
  }

  public get rawMessages(): string {
    return this.#rawMessage;
  }

  public get configName(): string {
    return this.#configName;
  }

  public get dialect(): Dialects {
    return this.#dialect;
  }
}

export class ModelError extends NormError {
  #model: string;

  constructor(
    model: string,
    code: ErrorCodes,
    message: string,
    configName: string,
    dialect: Dialects,
  ) {
    super(code, message, configName, dialect);
    this.#model = model;
  }

  public get model(): string {
    return this.#model;
  }
}
