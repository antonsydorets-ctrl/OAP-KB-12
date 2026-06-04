export type Role = "user" | "admin";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type PostCategory = "news" | "study" | "event" | "question";

export type Post = {
  id: number;
  title: string;
  category: PostCategory;
  body: string;
  authorId: number;
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: number;
  postId: number;
  authorId: number;
  body: string;
  createdAt: string;
};

export type AuthUser = {
  id: number;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthUser;
    }
  }
}
