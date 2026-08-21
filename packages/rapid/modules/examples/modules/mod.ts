/**
 * The modules barrel — the ONE input `initModules` takes. Hand-written
 * for now (the CLI `modules` generator will produce it); static, so it
 * is typed and bundler-/Workers-safe. Concrete modules only — never the
 * abstract `AppModule`.
 * @module
 */
export { Audit } from './Audit.ts';
export { Comments } from './Comments.ts';
export { Notifications } from './Notifications.ts';
export { Posts } from './Posts.ts';
export { Search } from './Search.ts';
export { Users } from './Users.ts';
