import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365 * 2,
  path: '/',
};

// UUID 형태(대/소문자 hex + 하이픈)만 계정 uid로 인정
const UID_RE = /^[0-9a-fA-F-]{8,64}$/;

// 로그인 없는 익명 계정: 브라우저마다 uid 쿠키 부여.
// 네이티브 앱(WKWebView)은 ?u=<identifierForVendor>로 자기 계정을 넘긴다 —
// 공유 익스텐션(Cookie: moa_uid=IDFV)과 동일 계정으로 맞추기 위함이다.
// WKWebView 쿠키스토어 타이밍에 의존하지 않도록 서버가 권위 있게 쿠키를 심고,
// URL에서 u를 제거해 리다이렉트(주소·기록에 uid 잔류 방지)한다.
export function middleware(req: NextRequest) {
  const forced = req.nextUrl.searchParams.get('u');
  const current = req.cookies.get('moa_uid')?.value;

  if (forced && UID_RE.test(forced)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('u');
    const res = NextResponse.redirect(url);
    if (forced !== current) res.cookies.set('moa_uid', forced, COOKIE_OPTS);
    return res;
  }

  const res = NextResponse.next();
  if (!current) res.cookies.set('moa_uid', crypto.randomUUID(), COOKIE_OPTS);
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
