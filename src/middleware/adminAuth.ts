// middleware/adminAuth.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const lineUserId = request.headers.get('x-line-userid');

  // Check if we're on an admin route
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!lineUserId) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
