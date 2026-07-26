import { NextResponse } from 'next/server';
import { db, rowsOf } from '@/lib/db';
import { getUid } from '@/lib/user';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const body = await req.json();
  const d = await db();
  const allowed = ['memo', 'visits', 'verdict', 'cat_id'] as const;
  for (const k of allowed) {
    if (k in body) await d.execute({ sql: `UPDATE places SET ${k}=? WHERE id=? AND uid=?`, args: [body[k], id, uid] });
  }
  const r = await d.execute({ sql: 'SELECT * FROM places WHERE id=? AND uid=?', args: [id, uid] });
  return NextResponse.json({ place: rowsOf(r)[0] });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const d = await db();
  await d.execute({ sql: 'DELETE FROM places WHERE id=? AND uid=?', args: [id, uid] });
  return NextResponse.json({ ok: true });
}
