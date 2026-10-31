import { NextResponse, type NextRequest } from 'next/server';
import type { ZodError, ZodType } from 'zod';
import { log } from '@tiktok-scheduler/shared';
import { ready, type SafeUser } from '@tiktok-scheduler/db';
import { getSessionUser } from './auth-server';
import { checkRateLimit } from './rate-limit';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(status: number, code: string, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (!raw) throw new ApiError(400, 'EMPTY_BODY', 'A JSON request body is required');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', flattenIssues(result.error));
  }
  return result.data;
}

export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!result.success) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Query validation failed', flattenIssues(result.error));
  }
  return result.data;
}

function flattenIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Same-origin guard for state-changing requests (CSRF defence on top of SameSite=Lax).
 * Requests without `Origin` are same-origin by construction for browsers; non-browser callers
 * (worker, curl) are not cookie-authenticated here.
 */
export function assertSameOrigin(request: NextRequest): void {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  if (origin !== expected && origin !== request.nextUrl.origin) {
    throw new ApiError(403, 'CROSS_ORIGIN_BLOCKED', 'Cross-origin state-changing requests are not allowed');
  }
}

interface RouteContext {
  request: NextRequest;
  user: SafeUser;
  params: Record<string, string>;
}

type RouteHandler = (context: RouteContext) => Promise<Response> | Response;

/**
 * Wrap a route: opens SQLite pragmas once, authenticates the session, guards cross-origin
 * mutations, rate limits, and converts thrown errors into `{ error }` envelopes.
 */
export function route(handler: RouteHandler, options: { public?: boolean; rateLimit?: number } = {}) {
  return async (request: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      await ready();
      assertSameOrigin(request);

      const limit = options.rateLimit ?? (options.public ? 60 : 240);
      const rateKey = `${request.nextUrl.pathname}:${clientIp(request)}`;
      const rate = await checkRateLimit(rateKey, limit);
      if (!rate.allowed) {
        return fail(429, 'RATE_LIMITED', 'Too many requests, slow down');
      }

      let user: SafeUser | null = null;
      if (!options.public) {
        user = await getSessionUser();
        if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
      }

      const params = (await context?.params) ?? {};
      return await handler({ request, user: user as SafeUser, params });
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.status, error.code, error.message, error.details);
      }
      const message = error instanceof Error ? error.message : 'Unexpected error';
      log('error', 'api_route_failed', { path: request.nextUrl.pathname, method: request.method, error: message });
      return fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
    }
  };
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'local';
}

export function requireParam(params: Record<string, string>, name: string): string {
  const value = params[name];
  if (!value) throw new ApiError(400, 'MISSING_PARAM', `Missing path parameter: ${name}`);
  return value;
}

export function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}