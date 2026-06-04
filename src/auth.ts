import type { NextFunction, Request, Response } from "express";
import { get } from "./db.js";
import { fail } from "./errors.js";
import { readToken, signToken, verifyPassword } from "./security.js";
import type { User } from "./types.js";
import { requiredString } from "./validation.js";

const attempts = new Map<string, { count: number; lockedUntil: number }>();

export async function login(req: Request, res: Response) {
  const email = requiredString(req.body.email, "email", 5, 120).toLowerCase();
  const password = requiredString(req.body.password, "password", 6, 100);
  const ip = req.ip ?? "local";
  const state = attempts.get(ip);

  if (state && state.lockedUntil > Date.now()) {
    fail(429, "TOO_MANY_ATTEMPTS", "Забагато спроб входу");
  }

  const user = await get<User>("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    const next = { count: (state?.count ?? 0) + 1, lockedUntil: 0 };
    if (next.count >= 5) next.lockedUntil = Date.now() + 60_000;
    attempts.set(ip, next);
    fail(401, "BAD_CREDENTIALS", "Невірні облікові дані");
  }

  attempts.delete(ip);
  res.json({
    ok: true,
    data: {
      token: signToken({ id: user.id, role: user.role }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    }
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const user = token ? readToken(token) : null;

  if (!user) fail(401, "UNAUTHORIZED", "Потрібна авторизація");
  req.currentUser = user;
  next();
}

export function canAccessOwner(req: Request, ownerId: number) {
  const user = req.currentUser;
  if (!user) fail(401, "UNAUTHORIZED", "Потрібна авторизація");
  if (user.role !== "admin" && user.id !== ownerId) fail(403, "FORBIDDEN", "Немає доступу до чужого ресурсу");
}
