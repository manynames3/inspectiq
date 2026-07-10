import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { emitMetric } from "./metrics.js";

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

export function notFound(resource = "Resource"): ApiError {
  return new ApiError(404, "NOT_FOUND", `${resource} was not found.`);
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, "CONFLICT", message, details);
}

export function versionConflict(resource: string, expectedVersion: number, actualVersion: number): ApiError {
  return new ApiError(409, "VERSION_CONFLICT", `${resource} changed after it was loaded. Refresh and review the latest version.`, {
    expectedVersion,
    actualVersion
  });
}

export function costGuardReached(resource: string, limit: number): ApiError {
  emitMetric("CostGuardRejections", 1, { Resource: resource.replaceAll(" ", "_") });
  return new ApiError(429, "COST_GUARD_REACHED", `${resource} monthly usage limit has been reached. Captured evidence remains saved.`, {
    limit,
    action: "Ask an administrator to review the monthly analysis allowance."
  });
}

export function forbidden(message: string, details?: unknown): ApiError {
  return new ApiError(403, "FORBIDDEN", message, details);
}

export function unauthorized(message: string, details?: unknown): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message, details);
}

export function validation(message: string, details?: unknown): ApiError {
  return new ApiError(400, "VALIDATION_FAILED", message, details);
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId as string;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        details: error.flatten()
      },
      requestId
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      requestId
    });
    return;
  }

  console.error(JSON.stringify({
    level: "error",
    event: "inspectiq.unhandled_error",
    requestId,
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined
  }));

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred."
    },
    requestId
  });
}
