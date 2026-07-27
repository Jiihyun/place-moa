import { NextResponse } from 'next/server';
import { track } from '@/lib/db';
import { getUid } from '@/lib/user';

// 클라이언트 이벤트 로깅 (visit, lp_view 등). 허용된 이름만 기록.
const ALLOWED = new Set([
  'visit', 'lp_view', 'lp_signup_click',
  'quiz_start', 'quiz_complete', 'cta_web', 'cta_ios', 'cta_android',
]);

export async function POST(req: Request) {
  const uid = await getUid();
  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = typeof body?.name === 'string' ? body.name : '';
  if (!ALLOWED.has(name)) return NextResponse.json({ ok: false }, { status: 400 });
  const props = body?.props && typeof body.props === 'object' ? body.props : {};
  await track(uid, name, props);
  return NextResponse.json({ ok: true });
}
