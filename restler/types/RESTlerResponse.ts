import type { RESTlerEndpoint } from './RESTlerEndpoint.ts';
import type { Status } from '../../dependencies.ts';

export type RESTlerResponseBody = Record<string, unknown> | Record<
  string,
  unknown
>[] | string;

export type RESTlerResponse<RESTlerResponseBody = Record<string, unknown>> = {
  endpoint: RESTlerEndpoint;
  headers: Record<string, string>;
  status: Status;
  authFailure: boolean;
  body?: RESTlerResponseBody;
};
