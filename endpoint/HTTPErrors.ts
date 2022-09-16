import { createHttpError } from "https://deno.land/std@0.150.0/http/http_errors.ts";
import { Status } from "../dependencies.ts";

export const resourceNotFound = (message: string) => {
  return createHttpError(Status.NotFound, message);
};

// export class ResourceNotFound extends HttpError {

//   constructor(message: string) {
//     super(message, {
//       expose: true,
//     });
//   }
// }

// const a = createHttpError(Status.NotFound, "Not found", {expose: true});
// console.log(a.status)
// console.log(a.message)
// console.log(a.headers)
