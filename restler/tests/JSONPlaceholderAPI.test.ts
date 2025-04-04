import * as asserts from '$asserts';
import { JSONPlaceholderAPI } from './fixtures/jsonplaceholder/JSONPlaceholderAPI.ts';
import type { Comment, Post, User } from './fixtures/jsonplaceholder/types.ts';

// Store original fetch
const originalFetch = globalThis.fetch;

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

// Setup mock responses for different endpoints
const setupMockFetch = () => {
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    await 1;
    const url = typeof input === 'string'
      ? input
      : (input as { url: string }).url;

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
      const post = mockPosts.find((p) => p.id === id);

      if (post) {
        return new Response(
          JSON.stringify(post),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      } else {
        return new Response(
          '{}',
          { status: 404, headers: { 'Content-Type': 'application/json' } },
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
  };
};

const cleanupMock = () => {
  globalThis.fetch = originalFetch;
};

Deno.test('RESTler.Example', async (h) => {
  await h.step('JSONPlaceholderAPI', async (t) => {
    await t.step('should get all posts', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const posts = await api.getPosts();
        asserts.assertEquals(posts.length, 2);
        asserts.assertEquals(posts[0]!.id, 1);
        asserts.assertEquals(posts[1]!.id, 2);
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get a single post', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const post = await api.getPost(1);
        asserts.assertNotEquals(post, null);
        asserts.assertEquals(post?.id, 1);
        asserts.assertEquals(post?.title, 'Test Post 1');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should return null for non-existent post', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const post = await api.getPost(999);
        asserts.assertEquals(post, {} as Post);
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get all users', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const users = await api.getUsers();
        asserts.assertEquals(users.length, 1);
        asserts.assertEquals(users[0]!.id, 1);
        asserts.assertEquals(users[0]!.name, 'Test User');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get a single user', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const user = await api.getUser(1);
        asserts.assertNotEquals(user, null);
        asserts.assertEquals(user?.id, 1);
        asserts.assertEquals(user?.username, 'testuser');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get comments for a post', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const comments = await api.getPostComments(1);
        asserts.assertEquals(comments.length, 1);
        asserts.assertEquals(comments[0]!.postId, 1);
        asserts.assertEquals(comments[0]!.email, 'comment@example.com');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should create a new post', async () => {
      setupMockFetch();
      try {
        const api = new JSONPlaceholderAPI();
        const newPost = {
          userId: 1,
          title: 'New Post',
          body: 'This is a new post',
        };

        const created = await api.createPost(newPost);
        asserts.assertNotEquals(created, null);
        asserts.assertEquals(created?.id, 3);
        asserts.assertEquals(created?.title, 'New Post');
      } finally {
        cleanupMock();
      }
    });
  });
});
