// JustNewMe — HTTP helpers
// Shared response shaping and error handling for API routes.

import { NextRequest, NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.extra ?? {}) } },
      { status: err.status },
    );
  }
  console.error('[jnm] unexpected error', err);
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'An unexpected error occurred.' } },
    { status: 500 },
  );
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export async function parseJson<T>(req: NextRequest, schema: (input: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body is not valid JSON.');
  }
  return schema(body);
}

/** Tiny zod-style validator for demo. */
export function v<T>(shape: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'string?' | 'number?'>, input: unknown): T {
  if (typeof input !== 'object' || input === null) {
    throw new HttpError(400, 'invalid_body', 'Body must be an object.');
  }
  const obj = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(shape)) {
    const val = obj[key];
    const required = !type.endsWith('?');
    const baseType = required ? type : type.slice(0, -1);
    if (val === undefined || val === null) {
      if (required) throw new HttpError(422, 'missing_field', `Field '${key}' is required.`, { param: key });
      continue;
    }
    if (baseType === 'string' && typeof val !== 'string') {
      throw new HttpError(422, 'invalid_type', `Field '${key}' must be a string.`, { param: key });
    }
    if (baseType === 'number' && typeof val !== 'number') {
      throw new HttpError(422, 'invalid_type', `Field '${key}' must be a number.`, { param: key });
    }
    if (baseType === 'boolean' && typeof val !== 'boolean') {
      throw new HttpError(422, 'invalid_type', `Field '${key}' must be a boolean.`, { param: key });
    }
    if (baseType === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
      throw new HttpError(422, 'invalid_type', `Field '${key}' must be an object.`, { param: key });
    }
    out[key] = val;
  }
  return out as T;
}

/** Common security headers. */
export function securityHeaders(res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  return res;
}
