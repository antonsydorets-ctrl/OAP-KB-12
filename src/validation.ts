import { fail } from "./errors.js";
import type { PostCategory } from "./types.js";

const categories = new Set<PostCategory>(["news", "study", "event", "question"]);

export function requiredString(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") fail(400, "VALIDATION_ERROR", `${field}: очікується рядок`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    fail(400, "VALIDATION_ERROR", `${field}: довжина має бути від ${min} до ${max}`);
  }
  return trimmed;
}

export function postCategory(value: unknown) {
  if (typeof value !== "string" || !categories.has(value as PostCategory)) {
    fail(400, "VALIDATION_ERROR", "category: невідома категорія");
  }
  return value as PostCategory;
}

export function numericId(value: unknown, field = "id") {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) fail(400, "VALIDATION_ERROR", `${field}: некоректний id`);
  return id;
}

export function safePostSort(value: unknown) {
  const allowed = new Set(["createdAt", "title", "category"]);
  return typeof value === "string" && allowed.has(value) ? value : "createdAt";
}

export function safeOrder(value: unknown) {
  return value === "asc" ? "ASC" : "DESC";
}
