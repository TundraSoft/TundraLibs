import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { JSONPlaceholderAPI } from './fixtures/jsonplaceholder/JSONPlaceholderAPI.ts';
import type { Comment, Post, User } from './fixtures/jsonplaceholder/types.ts';

// Mock data for tests
const mockPosts: Post[] = [
  {
    id: 1,
    userId: 1,
    title: 'Test Post 1',
    body: 'This is test post 1',
  },
  {
    id: 2,
    userId: 1,
    title: 'Test Post 2',
    body: 'This is test post 2',
  },
];

const mockUsers: User[] = [
  {
    id: 1,
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    address: {
      street: 'Test St',
      suite: 'Suite 1',
      city: 'Test City',
      zipcode: '12345',
      geo: {
        lat: '1',
        lng: '1',
      },
    },
    phone: '123-456-7890',
    website: 'example.com',
    company: {
      name: 'Test Company',
      catchPhrase: 'Testing is good',
      bs: 'test bs',
    },
  },
];

const mockComments: Comment[] = [
  {
    id: 1,
    postId: 1,
    name: 'Comment Name',
    email: 'comment@example.com',
    body: 'This is a comment',
  },
];

// Records what the client handed to `fetch` on the most recent call, so tests
// can assert on the request side (method, body) in addition to the response.
type CapturedRequest = {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
};

// Build a `fetch` stub that mimics the JSONPlaceholder API for each endpoint.
// Installed on the client via `setFetch` (the `_fetch` seam) rather than by
// reassigning `globalThis.fetch`, which compat's captured `fetch` ignores.
// The stub also captures each request into `captured` so tests can assert on it.
const createMockFetch = (
  captured: { request?: CapturedRequest },
): typeof fetch => {
  return (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    const url = typeof input === 'string'
      ? input
      : (input as { url: string }).url;

    // RESTler always passes headers as a plain Record<string, string> — never
    // a Headers instance — so capture/normalize via the Headers helper.
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit | undefined).forEach(
      (value, key) => {
        headers[key] = value;
      },
    );
    captured.request = {
      url,
      method: init?.method,
      headers,
      body: init?.body,
    };

    if (url.endsWith('/posts')) {
      if (init?.method === 'POST') {
        const postData = init.body
          ? (typeof init.body === 'string' ? JSON.parse(init.body) : {})
          : {};

        return new Response(
          JSON.stringify({
            id: 3,
            ...postData,
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      } else {
        return new Response(
          JSON.stringify(mockPosts),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else if (url.match(/\/posts\/\d+$/)) {
      const id = parseInt(url.split('/').pop() || '0');

      if (init?.method === 'PUT') {
        const updateData = init.body
          ? (typeof init.body === 'string' ? JSON.parse(init.body) : {})
          : {};

        return new Response(
          JSON.stringify({
            id,
            ...updateData,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (init?.method === 'DELETE') {
        // JSONPlaceholder returns an empty object with 200 on delete.
        return new Response(
          '{}',
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const post = mockPosts.find((p) => p.id === id);

      if (post) {
        return new Response(
          JSON.stringify(post),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } else {
        // Exercise the null path: an empty body parses to `undefined`, which
        // `getPost` maps to `null`.
        return new Response(
          '',
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } else if (url.match(/\/posts\/\d+\/comments$/)) {
      return new Response(
        JSON.stringify(mockComments),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } else if (url.endsWith('/users')) {
      return new Response(
        JSON.stringify(mockUsers),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } else if (url.match(/\/users\/\d+$/)) {
      const id = parseInt(url.split('/').pop() || '0');
      const user = mockUsers.find((u) => u.id === id);

      if (user) {
        return new Response(
          JSON.stringify(user),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } else {
        return new Response(
          '{}',
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      '{}',
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
};

// Create a client with the mock fetch seam installed, returning both the client
// and the capture handle so tests can inspect the request that was sent.
const createMockedClient = (): {
  api: JSONPlaceholderAPI;
  captured: { request?: CapturedRequest };
} => {
  const api = new JSONPlaceholderAPI();
  const captured: { request?: CapturedRequest } = {};
  api.setFetch(createMockFetch(captured));
  return { api, captured };
};

describe('restler.examples.jsonPlaceholderAPI', () => {
  describe('JSONPlaceholderAPI', () => {
    it('should get all posts', async () => {
      const { api } = createMockedClient();
      const posts = await api.getPosts();
      asserts.assertEquals(posts.length, 2);
      asserts.assertEquals(posts[0]!.id, 1);
      asserts.assertEquals(posts[1]!.id, 2);
    });

    it('should get a single post', async () => {
      const { api } = createMockedClient();
      const post = await api.getPost(1);
      asserts.assertNotEquals(post, null);
      asserts.assertEquals(post?.id, 1);
      asserts.assertEquals(post?.title, 'Test Post 1');
    });

    it('should return null for non-existent post', async () => {
      const { api } = createMockedClient();
      const post = await api.getPost(999);
      asserts.assertEquals(post, null);
    });

    it('should get all users', async () => {
      const { api } = createMockedClient();
      const users = await api.getUsers();
      asserts.assertEquals(users.length, 1);
      asserts.assertEquals(users[0]!.id, 1);
      asserts.assertEquals(users[0]!.name, 'Test User');
    });

    it('should get a single user', async () => {
      const { api } = createMockedClient();
      const user = await api.getUser(1);
      asserts.assertNotEquals(user, null);
      asserts.assertEquals(user?.id, 1);
      asserts.assertEquals(user?.username, 'testuser');
    });

    it('should get comments for a post', async () => {
      const { api } = createMockedClient();
      const comments = await api.getPostComments(1);
      asserts.assertEquals(comments.length, 1);
      asserts.assertEquals(comments[0]!.postId, 1);
      asserts.assertEquals(comments[0]!.email, 'comment@example.com');
    });

    it('should create a new post', async () => {
      const { api, captured } = createMockedClient();
      const newPost = {
        userId: 1,
        title: 'New Post',
        body: 'This is a new post',
      };

      const created = await api.createPost(newPost);
      asserts.assertNotEquals(created, null);
      asserts.assertEquals(created?.id, 3);
      asserts.assertEquals(created?.title, 'New Post');
      // Request side: POST with the JSON payload round-tripped.
      asserts.assertEquals(captured.request?.method, 'POST');
      asserts.assertEquals(
        JSON.parse(captured.request?.body as string),
        newPost,
      );
    });

    it('should update a post with PUT', async () => {
      const { api, captured } = createMockedClient();
      const update: Partial<Post> = {
        title: 'Updated Title',
        body: 'Updated body',
      };

      const updated = await api.updatePost(1, update);
      asserts.assertNotEquals(updated, null);
      asserts.assertEquals(updated?.id, 1);
      asserts.assertEquals(updated?.title, 'Updated Title');
      asserts.assertEquals(updated?.body, 'Updated body');
      // Request side: the method is PUT and the payload round-trips.
      asserts.assertEquals(captured.request?.method, 'PUT');
      asserts.assertEquals(captured.request?.url.endsWith('/posts/1'), true);
      asserts.assertEquals(
        JSON.parse(captured.request?.body as string),
        update,
      );
    });

    it('should delete a post with DELETE', async () => {
      const { api, captured } = createMockedClient();
      const result = await api.deletePost(1);
      // Status-based boolean result (200 -> true).
      asserts.assertEquals(result, true);
      // Request side: a DELETE to /posts/:id.
      asserts.assertEquals(captured.request?.method, 'DELETE');
      asserts.assertEquals(captured.request?.url.endsWith('/posts/1'), true);
    });
  });
});
