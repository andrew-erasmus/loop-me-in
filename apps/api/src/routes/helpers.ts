import type { z, ZodTypeAny } from 'zod';

/**
 * Small helpers shared by the route files: HTTP errors Fastify understands,
 * and a body parser that turns a Zod failure into a 400 with field details.
 */

interface HttpError extends Error {
  statusCode: number;
  details?: unknown;
}

function httpError(message: string, statusCode: number, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

export function badRequest(message: string, details?: unknown): HttpError {
  return httpError(message, 400, details);
}

export function notFound(message: string): HttpError {
  return httpError(message, 404);
}

/**
 * Parse a request body with a Zod schema, throwing a 400 on failure.
 *
 * Returns the schema's *output* type: a field with `.default()` is optional
 * going in but always present coming out, and inferring the input type here
 * would make every such field look possibly-undefined to callers.
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.flatten());
  }
  return result.data;
}

export function unauthorized(message = 'Not signed in'): HttpError {
  return httpError(message, 401);
}

export function forbidden(message: string): HttpError {
  return httpError(message, 403);
}

export function conflict(message: string): HttpError {
  return httpError(message, 409);
}
