import { TrieNode } from '../mod.ts';
import { pathToRegexp } from 'npm:path-to-regexp';

const routes = [
  '/users/{id}',
  '/users/{id}/posts',
  '/users/{id}/posts/{pid}',
  '/users/{id}/posts/{pid}/comments',
  '/users/{id}/comments/{cid}',
  '/users/{id}/profile',
  '/users/{id}/settings',
  '/users/{id}/friends',
  '/users/{id}/friends/{fid}',
  '/users/{id}/groups',
  '/users/{id}/groups/{gid}',
  '/users/{id}/messages',
  '/users/{id}/messages/{mid}',
  '/users/{id}/notifications',
  '/users/{id}/notifications/{nid}',
  '/users/{id}/activity',
  '/users/{id}/activity/{aid}',
  '/users/{id}/photos',
  '/users/{id}/photos/{photoId}',
  '/users/{id}/videos',
  '/users/{id}/videos/{vid}',
  '/users/{id}/music',
  '/users/{id}/music/{mid}',
  '/users/{id}/events',
  '/users/{id}/events/{eid}',
  '/users/{id}/calendar',
  '/users/{id}/calendar/{cid}',
  '/users/{id}/tasks',
  '/users/{id}/tasks/{tid}',
  '/users/{id}/notes',
  '/users/{id}/notes/{nid}',
  '/users/{id}/files',
  '/users/{id}/files/{fid}',
  '/users/{id}/folders',
  '/users/{id}/folders/{fid}',
  '/users/{id}/drafts',
  '/users/{id}/drafts/{did}',
  '/users/{id}/archives',
  '/users/{id}/archives/{aid}',
  '/users/{id}/trash',
  '/users/{id}/trash/{tid}',
  '/users/{id}/spam',
  '/users/{id}/spam/{sid}',
  '/users/{id}/blocked',
  '/users/{id}/blocked/{bid}',
  '/users/{id}/following',
  '/users/{id}/following/{fid}',
  '/users/{id}/followers',
  '/users/{id}/followers/{fid}',
  '/users/{id}/subscriptions',
  '/users/{id}/subscriptions/{sid}',
  '/users/{id}/likes',
  '/users/{id}/likes/{lid}',
  '/users/{id}/dislikes',
  '/users/{id}/dislikes/{did}',
  '/users/{id}/saved',
  '/users/{id}/saved/{sid}',
  '/users/{id}/history',
  '/users/{id}/history/{hid}',
  '/users/{id}/watchlist',
  '/users/{id}/watchlist/{wid}',
  '/users/{id}/playlists',
  '/users/{id}/playlists/{pid}',
  '/users/{id}/albums',
  '/users/{id}/albums/{aid}',
  '/users/{id}/artists',
  '/users/{id}/artists/{aid}',
  '/users/{id}/genres',
  '/users/{id}/genres/{gid}',
  '/users/{id}/languages',
  '/users/{id}/languages/{lid}',
  '/users/{id}/devices',
  '/users/{id}/devices/{did}',
  '/users/{id}/locations',
  '/users/{id}/locations/{lid}',
  '/users/{id}/connections',
  '/users/{id}/connections/{cid}',
  '/users/{id}/contacts',
  '/users/{id}/contacts/{cid}',
];

const routes2 = [
  '/users/:id',
  '/users/:id/posts',
  '/users/:id/posts/:pid',
  '/users/:id/posts/:pid/comments',
  '/users/:id/comments/:cid',
  '/users/:id/profile',
  '/users/:id/settings',
  '/users/:id/friends',
  '/users/:id/friends/:fid',
  '/users/:id/groups',
  '/users/:id/groups/:gid',
  '/users/:id/messages',
  '/users/:id/messages/:mid',
  '/users/:id/notifications',
  '/users/:id/notifications/:nid',
  '/users/:id/activity',
  '/users/:id/activity/:aid',
  '/users/:id/photos',
  '/users/:id/photos/:photoId',
  '/users/:id/videos',
  '/users/:id/videos/:vid',
  '/users/:id/music',
  '/users/:id/music/:mid',
  '/users/:id/events',
  '/users/:id/events/:eid',
  '/users/:id/calendar',
  '/users/:id/calendar/:cid',
  '/users/:id/tasks',
  '/users/:id/tasks/:tid',
  '/users/:id/notes',
  '/users/:id/notes/:nid',
  '/users/:id/files',
  '/users/:id/files/:fid',
  '/users/:id/folders',
  '/users/:id/folders/:fid',
  '/users/:id/drafts',
  '/users/:id/drafts/:did',
  '/users/:id/archives',
  '/users/:id/archives/:aid',
  '/users/:id/trash',
  '/users/:id/trash/:tid',
  '/users/:id/spam',
  '/users/:id/spam/:sid',
  '/users/:id/blocked',
  '/users/:id/blocked/:bid',
  '/users/:id/following',
  '/users/:id/following/:fid',
  '/users/:id/followers',
  '/users/:id/followers/:fid',
  '/users/:id/subscriptions',
  '/users/:id/subscriptions/:sid',
  '/users/:id/likes',
  '/users/:id/likes/:lid',
  '/users/:id/dislikes',
  '/users/:id/dislikes/:did',
  '/users/:id/saved',
  '/users/:id/saved/:sid',
  '/users/:id/history',
  '/users/:id/history/:hid',
  '/users/:id/watchlist',
  '/users/:id/watchlist/:wid',
  '/users/:id/playlists',
  '/users/:id/playlists/:pid',
  '/users/:id/albums',
  '/users/:id/albums/:aid',
  '/users/:id/artists',
  '/users/:id/artists/:aid',
  '/users/:id/genres',
  '/users/:id/genres/:gid',
  '/users/:id/languages',
  '/users/:id/languages/:lid',
  '/users/:id/devices',
  '/users/:id/devices/:did',
  '/users/:id/locations',
  '/users/:id/locations/:lid',
  '/users/:id/connections',
  '/users/:id/connections/:cid',
  '/users/:id/contacts',
  '/users/:id/contacts/:cid',
];

const urls = [
  '/users/123/posts/456',
  '/users/123/posts/456/comments/789',
  '/users/123/profile',
  '/users/123/settings',
  '/users/123/friends/123',
  '/users/123/groups/456',
  '/api/v1/users/123/posts/456/comments/789',
  '/api/v2/users/123/posts/456/comments/789',
  '/api/v3/users/123/posts/456/comments/789',
  '/api/v4/users/123/posts/456/comments/789',
];

const radRouter = new TrieNode();
routes.forEach((route) => {
  radRouter.addNode(route);
});

const pathToRegexpRoutes = routes2.map((route) => {
  return pathToRegexp(route);
});

const benchmark = () => {
  const radRouterTimes = [];
  const pathToRegexpTimes = [];

  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    urls.forEach((url) => {
      radRouter.find(url);
    });
    const end = performance.now();
    radRouterTimes.push(end - start);

    const start2 = performance.now();
    urls.forEach((url) => {
      pathToRegexpRoutes.forEach((regexp) => {
        regexp.exec(url);
      });
    });
    const end2 = performance.now();
    pathToRegexpTimes.push(end2 - start2);
  }

  const radRouterAverage = radRouterTimes.reduce((a, b) => a + b, 0) /
    radRouterTimes.length;
  const pathToRegexpAverage = pathToRegexpTimes.reduce((a, b) => a + b, 0) /
    pathToRegexpTimes.length;

  console.log(`RadRouter average time: ${radRouterAverage}ms`);
  console.log(`path-to-regexp average time: ${pathToRegexpAverage}ms`);
};

benchmark();
