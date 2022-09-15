import { HttpError, Status } from "../dependencies.ts";

export class ResourceNotFound extends HttpError {
  constructor(message: string) {
    super(message, {
      expose: true,
    });
  }
}
