import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./security.js";

const dbPath = process.env.DB_PATH ?? path.resolve("data", "posts-board.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

export function run<T = unknown>(sql: string, params: unknown[] = []) {
  const info = db.prepare(sql).run(...params);
  return Promise.resolve({
    lastID: Number(info.lastInsertRowid),
    changes: info.changes
  } as T & { lastID: number; changes: number });
}

export function get<T>(sql: string, params: unknown[] = []) {
  return Promise.resolve(db.prepare(sql).get(...params) as T | undefined);
}

export function all<T>(sql: string, params: unknown[] = []) {
  return Promise.resolve(db.prepare(sql).all(...params) as T[]);
}

export async function initDb() {
  db.exec("PRAGMA foreign_keys = ON");
  await run(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const migration = await get<{ id: number }>("SELECT id FROM migrations WHERE name = ?", ["001_init"]);
  if (!migration) {
    await run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('user', 'admin')) DEFAULT 'user',
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
      category TEXT NOT NULL CHECK(category IN ('news', 'study', 'event', 'question')),
      body TEXT NOT NULL CHECK(length(body) BETWEEN 5 AND 4000),
      authorId INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run(`CREATE TABLE comments (
      id INTEGER PRIMARY KEY,
      postId INTEGER NOT NULL,
      authorId INTEGER NOT NULL,
      body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await run("CREATE INDEX idx_posts_author ON posts(authorId)");
    await run("CREATE INDEX idx_posts_category ON posts(category)");
    await run("CREATE INDEX idx_comments_post ON comments(postId)");
    await run("INSERT INTO migrations(name) VALUES (?)", ["001_init"]);
  }

  await seed();
}

async function seed() {
  const existing = await get<{ count: number }>("SELECT COUNT(*) as count FROM users");
  if (existing && existing.count > 0) return;

  const admin = hashPassword("Admin123!");
  const anna = hashPassword("User123!");
  const bohdan = hashPassword("User123!");

  await run("INSERT INTO users(name, email, role, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?)", [
    "Admin",
    "admin@group.local",
    "admin",
    admin.hash,
    admin.salt
  ]);
  await run("INSERT INTO users(name, email, role, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?)", [
    "Анна",
    "anna@group.local",
    "user",
    anna.hash,
    anna.salt
  ]);
  await run("INSERT INTO users(name, email, role, passwordHash, passwordSalt) VALUES (?, ?, ?, ?, ?)", [
    "Богдан",
    "bohdan@group.local",
    "user",
    bohdan.hash,
    bohdan.salt
  ]);
}
