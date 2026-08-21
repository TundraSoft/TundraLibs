/**
 * The modules barrel — hand-written and static, so a bundler (and a
 * Worker) sees every module; `app.modules({ modules: [blog] })` boots
 * exactly what is exported here. Bases (`BlogModule`) stay out.
 * @module
 */
export { Audit } from './Audit.ts';
export { CommentsSocket } from './CommentsSocket.ts';
export { Posts } from './Posts.ts';
