import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '../middleware';

function req(path: string, cookie?: string) {
  const request = new NextRequest(`http://localhost:3100${path}`);
  if (cookie) request.cookies.set('tts_session', cookie);
  return request;
}

describe('middleware auth gate', () => {
  it('sends anonymous visitors to /login with a next param', () => {
    const res = middleware(req('/dashboard')) as Response;
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3100/login?next=%2Fdashboard');
  });

  it('lets a cookied request reach /login instead of bouncing it to /dashboard', () => {
    // Regression: cookie presence is not proof of a live session (the row may be gone), so
    // redirecting here looped forever against the dashboard layout's database check.
    const res = middleware(req('/login', 'stale-token')) as Response;
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes a cookied request through even when the session row may be gone', () => {
    const res = middleware(req('/queue', 'stale-token')) as Response;
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
