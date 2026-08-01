/**
 * Types for JSONPlaceholder API responses
 */

/**
 * Post object returned by the API
 */
export type Post = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

/**
 * User object returned by the API
 */
export type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  address: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: {
      lat: string;
      lng: string;
    };
  };
  phone: string;
  website: string;
  company: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
};

/**
 * Comment object returned by the API
 */
export type Comment = {
  postId: number;
  id: number;
  name: string;
  email: string;
  body: string;
};
