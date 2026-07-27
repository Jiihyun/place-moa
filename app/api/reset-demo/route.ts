import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// 임시 정리용 — 옛 데모 장소(다운타우너·노티드·월향) 일괄 삭제. 사용 후 이 라우트는 제거한다.
const KEY = 'moa-cleanup-7x2q';
const OLD_TITLES = ['다운타우너 강남', '노티드 강남', '월향 강남'];

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key');
  if (key !== KEY) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const d = await db();
  const ph = OLD_TITLES.map(() => '?').join(',');
  const r = await d.execute({
    sql: `DELETE FROM places WHERE source='demo' AND title IN (${ph})`,
    args: OLD_TITLES,
  });
  return NextResponse.json({ deleted: r.rowsAffected });
}
