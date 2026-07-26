import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 로그인 없는 익명 계정: 브라우저마다 uid 쿠키 부여
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get('moa_uid')) {
    const uid = crypto.randomUUID();
    res.cookies.set('moa_uid', uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365 * 2,
      path: '/',
    });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
