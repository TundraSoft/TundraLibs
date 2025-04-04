import { RESTler } from '../../../RESTler.ts';
import type { RESTlerOptions } from '../../../types/Options.ts';
import type { Comment, Post, User } from './types.ts';

/**
 * Example client for JSONPlaceholder, a free REST API for testing and prototyping
 * https://jsonplaceholder.typicode.com/
 */
export class JSONPlaceholderAPI extends RESTler {
  public readonly vendor = 'JSONPlaceholder';

  constructor(options?: Partial<RESTlerOptions>) {
    super({
      baseURL: 'https://jsonplaceholder.typicode.com',
      ...options,
    }, {
      timeout: 15, // Slightly longer timeout than default
    });
  }

  /**
   * Get all posts
   * @returns Array of post objects
   */
  async getPosts(): Promise<Post[]> {
    const response = await this._makeRequest<Post[]>(
      { path: '/posts' },
      { method: 'GET' },
    );
    return response.body || [];
  }

  /**
   * Get a specific post by ID
   * @param id Post ID
   * @returns Post object or null if not found
   */
  async getPost(id: number): Promise<Post | null> {
    const response = await this._makeRequest<Post>(
      { path: `/posts/${id}` },
      { method: 'GET' },
    );
    return response.body || null;
  }

  /**
   * Get all users
   * @returns Array of user objects
   */
  async getUsers(): Promise<User[]> {
    const response = await this._makeRequest<User[]>(
      { path: '/users' },
      { method: 'GET' },
    );
    return response.body || [];
  }

  /**
   * Get a specific user by ID
   * @param id User ID
   * @returns User object or null if not found
   */
  async getUser(id: number): Promise<User | null> {
    const response = await this._makeRequest<User>(
      { path: `/users/${id}` },
      { method: 'GET' },
    );
    return response.body || null;
  }

  /**
   * Get comments for a specific post
   * @param postId Post ID
   * @returns Array of comment objects
   */
  async getPostComments(postId: number): Promise<Comment[]> {
    const response = await this._makeRequest<Comment[]>(
      { path: `/posts/${postId}/comments` },
      { method: 'GET' },
    );
    return response.body || [];
  }

  /**
   * Create a new post
   * @param post Post data without ID (will be assigned by server)
   * @returns Created post object or null on failure
   */
  async createPost(post: Omit<Post, 'id'>): Promise<Post | null> {
    const response = await this._makeRequest<Post>(
      { path: '/posts' },
      {
        method: 'POST',
        contentType: 'JSON',
        payload: post,
      },
    );
    return response.body || null;
  }

  /**
   * Update an existing post
   * @param id Post ID to update
   * @param post Partial post data to update
   * @returns Updated post object or null on failure
   */
  async updatePost(id: number, post: Partial<Post>): Promise<Post | null> {
    const response = await this._makeRequest<Post>(
      { path: `/posts/${id}` },
      {
        method: 'PUT',
        contentType: 'JSON',
        payload: post,
      },
    );
    return response.body || null;
  }

  /**
   * Delete a post by ID
   * @param id Post ID to delete
   * @returns true if successful, false otherwise
   */
  async deletePost(id: number): Promise<boolean> {
    const response = await this._makeRequest(
      { path: `/posts/${id}` },
      { method: 'DELETE' },
    );
    return response.status === 200;
  }
}
