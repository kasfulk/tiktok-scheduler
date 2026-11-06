import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth', '/api/health', '/api/tiktok/callback'];

/**
 * Edge-safe gate: cookie presence only. Real session validation happens in the server layout and
 * in every API handler, because the Edge runtime cannot open SQLite.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('tts_session')?.value);
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // No "cookie present => already logged in" redirect here. A cookie whose Session row is gone
  // (expired, re-seeded DB) is indistinguishable from a real one at the Edge, so bouncing /login
  // to /dashboard looped forever against the dashboard layout's DB check. The (auth) layout does
  // that redirect properly, with the database in reach.
  return NextResponse.next();
}

export const config = {
  // /api is excluded on purpose. Middleware makes Next clone the request body, and the clone is
  // capped at 10 MB (experimental.proxyClientMaxBodySize), which silently truncated every upload
  // larger than that. API auth does not need this gate anyway: `route()` validates the session and
  // answers 401 itself.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};