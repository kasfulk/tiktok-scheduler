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

  if (hasSession && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /api is excluded on purpose. Middleware makes Next clone the request body, and the clone is
  // capped at 10 MB (experimental.proxyClientMaxBodySize), which silently truncated every upload
  // larger than that. API auth does not need this gate anyway: `route()` validates the session and
  // answers 401 itself.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};