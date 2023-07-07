// import { createHttpError } from "https://deno.land/std@0.150.0/http/http_errors.ts";
import {
  ErrorStatus,
  isClientErrorStatus,
  Status,
  STATUS_TEXT,
} from '../dependencies.ts';

export type HTTPErrorData =
  | string
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export class HTTPError extends Error {
  #status: ErrorStatus;
  #data: HTTPErrorData;
  #headers: Headers = new Headers();
  // #internal = true;

  constructor(
    data: string | Record<string, unknown> | Array<Record<string, unknown>>,
    status = Status.InternalServerError,
    headers?: Headers,
  ) {
    // Refine this
    super(`HTTP Error: ${status} ${STATUS_TEXT[status]}`);
    Object.setPrototypeOf(this, HTTPError.prototype);
    this.#data = data;
    this.#status = status as ErrorStatus;
    if (headers) {
      this.#headers = headers;
    }
  }

  get status(): Status {
    return this.#status;
  }

  get headers(): Headers {
    return this.#headers;
  }

  get data():
    | string
    | Record<string, unknown>
    | Array<Record<string, unknown>> {
    if (typeof this.#data === 'string') {
      return {
        message: this.#data,
      };
    } else {
      return this.#data;
    }
  }

  get internal(): boolean {
    // Consider anything outside 400 as internal error
    if (isClientErrorStatus(this.#status)) {
      return false;
    }
    return true;
  }
}

export const isHTTPError = (error: unknown): error is HTTPError => {
  return error instanceof HTTPError;
};

export const resourceNotFound = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.NotFound, headers);
};

export const badRequest = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.BadRequest, headers);
};

export const internalServerError = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.InternalServerError, headers);
};

export const unauthorized = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.Unauthorized, headers);
};

export const methodNotAllowed = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.MethodNotAllowed, headers);
};

export const tooManyRequests = (data: HTTPErrorData, headers?: Headers) => {
  return new HTTPError(data, Status.TooManyRequests, headers);
};
