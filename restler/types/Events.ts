import { RESTlerBaseError } from '../mod.ts';
import type { RESTlerRequest, RESTlerResponse } from './mod.ts';

export type RESTlerEvents = {
  auth: (authInfo: unknown) => void;
  authFailure: (request: RESTlerRequest) => void;
  response: (
    request: RESTlerRequest,
    response: RESTlerResponse,
    error?: RESTlerBaseError,
  ) => void;
  request: (request: RESTlerRequest) => void;
  track: (name: string, args?: unknown) => void; // Helper event to "track" certain events in implemented class
  timeout: (request: RESTlerRequest) => void;
};