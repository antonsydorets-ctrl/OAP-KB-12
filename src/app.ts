import express, { type NextFunction, type Request, type Response } from "express";
import { login, requireAuth, canAccessOwner } from "./auth.js";
import { all, get, run } from "./db.js";
import { errorHandler, fail, notFound } from "./errors.js";
import { cors, securityHeaders } from "./security.js";
import type { Comment, Post, User } from "./types.js";
import { numericId, postCategory, requiredString, safeOrder, safePostSort } from "./validation.js";

type PostListItem = Post & { authorName: string; commentsCount: number };

function kyivDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createApp() {
  const app = express();

  app.use(securityHeaders);
  app.use(cors);
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, data: { status: "ready" } }));
  app.post("/api/v1/auth/login", asyncRoute(login));

  app.get("/api/v1/users", requireAuth, asyncRoute(async (_req, res) => {
    const users = await all<Pick<User, "id" | "name" | "email" | "role" | "createdAt">>(
      "SELECT id, name, email, role, createdAt FROM users ORDER BY name"
    );
    res.json({ ok: true, data: users });
  }));

  app.get("/api/v1/posts", requireAuth, asyncRoute(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const sortBy = safePostSort(req.query.sortBy);
    const order = safeOrder(req.query.order);
    const params: unknown[] = [];
    const where: string[] = [];

    if (search) {
      where.push("(p.title LIKE ? OR p.body LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      where.push("p.category = ?");
      params.push(postCategory(category));
    }

    const sql = `
      SELECT p.*, u.name as authorName, COUNT(c.id) as commentsCount
      FROM posts p
      JOIN users u ON u.id = p.authorId
      LEFT JOIN comments c ON c.postId = p.id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      GROUP BY p.id
      ORDER BY p.${sortBy} ${order}
    `;

    const posts = await all<PostListItem>(sql, params);
    res.json({ ok: true, data: posts });
  }));

  app.get("/api/v1/posts/analytics/by-category", requireAuth, asyncRoute(async (_req, res) => {
    const rows = await all<{ category: string; postsCount: number; commentsCount: number }>(`
      SELECT p.category, COUNT(DISTINCT p.id) as postsCount, COUNT(c.id) as commentsCount
      FROM posts p
      LEFT JOIN comments c ON c.postId = p.id
      GROUP BY p.category
      ORDER BY postsCount DESC
    `);
    res.json({ ok: true, data: rows });
  }));

  app.get("/api/v1/posts/:id", requireAuth, asyncRoute(async (req, res) => {
    const id = numericId(req.params.id);
    const post = await get<Post & { authorName: string }>(
      `SELECT p.*, u.name as authorName FROM posts p JOIN users u ON u.id = p.authorId WHERE p.id = ?`,
      [id]
    );
    if (!post) fail(404, "POST_NOT_FOUND", "Оголошення не знайдено");
    canAccessOwner(req, post.authorId);
    res.json({ ok: true, data: post });
  }));

  app.post("/api/v1/posts", requireAuth, asyncRoute(async (req, res) => {
    const title = requiredString(req.body.title, "title", 3, 120);
    const category = postCategory(req.body.category);
    const body = requiredString(req.body.body, "body", 5, 4000);
    const authorId = req.currentUser!.id;

    const now = kyivDateTime();
    const result = await run("INSERT INTO posts(title, category, body, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)", [
      title,
      category,
      body,
      authorId,
      now,
      now
    ]);
    const post = await get<Post>("SELECT * FROM posts WHERE id = ?", [result.lastID]);
    res.status(201).json({ ok: true, data: post });
  }));

  app.put("/api/v1/posts/:id", requireAuth, asyncRoute(async (req, res) => {
    const id = numericId(req.params.id);
    const existing = await get<Post>("SELECT * FROM posts WHERE id = ?", [id]);
    if (!existing) fail(404, "POST_NOT_FOUND", "Оголошення не знайдено");
    canAccessOwner(req, existing.authorId);

    const title = requiredString(req.body.title, "title", 3, 120);
    const category = postCategory(req.body.category);
    const body = requiredString(req.body.body, "body", 5, 4000);

    await run("UPDATE posts SET title = ?, category = ?, body = ?, updatedAt = ? WHERE id = ?", [
      title,
      category,
      body,
      kyivDateTime(),
      id
    ]);
    const post = await get<Post>("SELECT * FROM posts WHERE id = ?", [id]);
    res.json({ ok: true, data: post });
  }));

  app.delete("/api/v1/posts/:id", requireAuth, asyncRoute(async (req, res) => {
    const id = numericId(req.params.id);
    const existing = await get<Post>("SELECT * FROM posts WHERE id = ?", [id]);
    if (!existing) fail(404, "POST_NOT_FOUND", "Оголошення не знайдено");
    canAccessOwner(req, existing.authorId);

    await run("DELETE FROM posts WHERE id = ?", [id]);
    res.status(204).end();
  }));

  app.get("/api/v1/posts/:id/comments", requireAuth, asyncRoute(async (req, res) => {
    const postId = numericId(req.params.id, "postId");
    const post = await get<Post>("SELECT * FROM posts WHERE id = ?", [postId]);
    if (!post) fail(404, "POST_NOT_FOUND", "Оголошення не знайдено");

    const comments = await all<Comment & { authorName: string }>(
      `SELECT c.*, u.name as authorName
       FROM comments c JOIN users u ON u.id = c.authorId
       WHERE c.postId = ?
       ORDER BY c.createdAt ASC`,
      [postId]
    );
    res.json({ ok: true, data: comments });
  }));

  app.post("/api/v1/posts/:id/comments", requireAuth, asyncRoute(async (req, res) => {
    const postId = numericId(req.params.id, "postId");
    const body = requiredString(req.body.body, "body", 1, 1000);
    const post = await get<Post>("SELECT * FROM posts WHERE id = ?", [postId]);
    if (!post) fail(404, "POST_NOT_FOUND", "Оголошення не знайдено");

    const result = await run("INSERT INTO comments(postId, authorId, body, createdAt) VALUES (?, ?, ?, ?)", [
      postId,
      req.currentUser!.id,
      body,
      kyivDateTime()
    ]);
    const comment = await get<Comment>("SELECT * FROM comments WHERE id = ?", [result.lastID]);
    res.status(201).json({ ok: true, data: comment });
  }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

