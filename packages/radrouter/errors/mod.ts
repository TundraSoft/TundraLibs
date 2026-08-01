// Re-export every error class from one barrel. Consumers do
// `import { DuplicateRouteError } from '@tundralibs/radrouter/errors'`.
export { RadRouterError } from './Base.ts';
export {
  DuplicateRouteError,
  type DuplicateRouteErrorMeta,
} from './DuplicateRouteError.ts';
export {
  MalformedPathError,
  type MalformedPathErrorMeta,
} from './MalformedPathError.ts';
export {
  RouteConflictError,
  type RouteConflictErrorMeta,
} from './RouteConflictError.ts';
