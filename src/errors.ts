import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new ApiError(status, code, message, details);
}

export function notFound(_req: Request, _res: Response): never {
  fail(404, "NOT_FOUND", "Маршрут не знайдено");
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details }
    });
  }

  return res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Внутрішня помилка сервера" }
  });
}
