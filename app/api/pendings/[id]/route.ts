import { NextResponse } from 'next/server';
import { db, rowsOf } from '@/lib/db';
import { getUid } from '@/lib/user';

// 대기함 확정: 체크한 후보만 저장
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const { chosen } = await req.json();
  const d = await db();
  const pr = await d.execute({ sql: 'SELECT * FROM pendings WHERE id=? AND uid=?', args: [id, uid] });
  if (!pr.rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const pend: any = rowsOf(pr)[0];
  const saved: any[] = [];
  for (const c of chosen || []) {
    const info = await d.execute({
      sql: 'INSERT INTO places (uid,title,cat_id,region,address,photo,lat,lng,source,source_url,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: [uid, c.name, c.cat_id, c.region, c.address || '', c.photo || '', c.lat, c.lng, pend.source, pend.source_url, (c.memo || '').trim()],
    });
    const r = await d.execute({ sql: 'SELECT * FROM places WHERE id=?', args: [Number(info.lastInsertRowid)] });
    saved.push(rowsOf(r)[0]);
  }
  await d.execute({ sql: 'DELETE FROM pendings WHERE id=? AND uid=?', args: [id, uid] });
  return NextResponse.json({ saved });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const d = await db();
  await d.execute({ sql: 'DELETE FROM pendings WHERE id=? AND uid=?', args: [id, uid] });
  return NextResponse.json({ ok: true });
}
