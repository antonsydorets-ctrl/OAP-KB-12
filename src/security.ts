import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const TOKEN_SECRET = process.env.TOKEN_SECRET ?? "lab-variant-4-local-secret-change-me";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function signToken(payload: { id: number; role: string }) {
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readToken(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    id: number;
    role: "user" | "admin";
    exp: number;
  };

  if (payload.exp < Date.now()) return null;
  return { id: payload.id, role: payload.role };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'");
  next();
}

export function cors(req: Request, res: Response, next: NextFunction) {
  const allowed = new Set(["http://localhost:5500", "http://127.0.0.1:5500"]);
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}
