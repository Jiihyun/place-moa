import { NextResponse } from 'next/server';
import { db, track } from '@/lib/db';
import { getUid } from '@/lib/user';

// 사전신청 저장 (관심 규모 = 보조 지표). 크루 닉네임 또는 이메일로 신청.
export async function POST(req: Request) {
  const uid = await getUid();
  let body: any = {};
  try { body = await req.json(); } catch {}

  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim().slice(0, 30) : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: '이메일을 확인해 주세요' }, { status: 400 });
  if (!nickname && !email)
    return NextResponse.json({ error: '크루 닉네임을 입력해 주세요' }, { status: 400 });

  const platform = ['ios', 'android', 'web'].includes(body?.platform) ? body.platform : 'unknown';
  const persona = typeof body?.persona === 'string' ? body.persona.slice(0, 40) : '';
  const d = await db();
  await d.execute({
    sql: 'INSERT INTO waitlist (email,nickname,uid,platform,persona) VALUES (?,?,?,?,?)',
    args: [email, nickname, uid, platform, persona],
  });
  await track(uid, 'lp_signup', { nickname, platform, persona });
  return NextResponse.json({ ok: true });
}
