import { HTTPMethods } from '../../dependencies.ts';
import { Status } from '../../dependencies.ts';

export type RESTlerRequestObject<Body extends Record<string, unknown> = Record<string, unknown>> = {
  method: HTTPMethods;
  endpoint: string;
  version?: string;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Body | Body[];
  timeout?: number;
}

export type RESTlerResponseObject<Body extends Record<string, unknown> = Record<string, unknown>> = {
  endpoint: string;
  headers: Record<string, string>;
  body?: Body | Body[];
  status: Status;
}
