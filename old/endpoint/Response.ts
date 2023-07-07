import type { HTTPResponse } from './types/mod.ts';
import { Status } from '../dependencies.ts';

const Response = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  status: Status,
  payload?: T | Array<T>,
  headers = new Headers(),
): HTTPResponse<T> => {
  if (payload) {
    if (!Array.isArray(payload)) {
      payload = [payload];
    }
  }
  return {
    status,
    payload,
    headers,
  };
};

export const ok = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.OK, payload, headers);
};

export const created = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.Created, payload, headers);
};

export const noContent = (headers = new Headers()): HTTPResponse => {
  return Response(Status.NoContent, undefined, headers);
};

export const badRequest = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.BadRequest, payload, headers);
};

export const unauthorized = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.Unauthorized, payload, headers);
};

export const forbidden = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.Forbidden, payload, headers);
};

export const notFound = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.NotFound, payload, headers);
};

export const notAllowed = (headers = new Headers()): HTTPResponse => {
  return Response(Status.MethodNotAllowed, undefined, headers);
};

export const internalServerError = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.InternalServerError, payload, headers);
};

export const notImplemented = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.NotImplemented, payload, headers);
};

export const badGateway = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.BadGateway, payload, headers);
};

export const serviceUnavailable = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.ServiceUnavailable, payload, headers);
};

export const gatewayTimeout = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.GatewayTimeout, payload, headers);
};

export const tooSoon = <T extends Record<string, unknown>>(
  payload?: Array<T> | T,
  headers = new Headers(),
): HTTPResponse<T> => {
  return Response(Status.TooEarly, payload, headers);
};
