import type { RESTlerEndpoint } from './Endpoint.ts';
import type { StatusCode } from '../../dependencies.ts';

export type RESTlerResponseBody = Record<string, unknown> | Record<
  string,
  unknown
>[] | string;

export type RESTlerResponse<RESTlerResponseBody = Record<string, unknown>> = {
  endpoint: RESTlerEndpoint;
  headers: Record<string, string>;
  status: StatusCode;
  authFailure: boolean;
  body?: RESTlerResponseBody;
  timeTaken: number;
};
