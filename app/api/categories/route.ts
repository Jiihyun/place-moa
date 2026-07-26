import { NextResponse } from 'next/server';
import { db, ensureCats, rowsOf } from '@/lib/db';
import { getUid } from '@/lib/user';

export async function POST(req: Request) {
  const uid = await getUid();
  const d = await db();
  await ensureCats(uid);
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  await d.execute({ sql: 'INSERT INTO categories (uid,name) VALUES (?,?)', args: [uid, name.trim()] });
  const cats = rowsOf(await d.execute({ sql: 'SELECT * FROM categories WHERE uid=? ORDER BY id', args: [uid] }));
  return NextResponse.json({ cats });
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const d = await db();
  const { id } = await req.json();
  await d.execute({ sql: 'UPDATE places SET cat_id=NULL WHERE cat_id=? AND uid=?', args: [id, uid] });
  await d.execute({ sql: 'DELETE FROM categories WHERE id=? AND uid=?', args: [id, uid] });
  const cats = rowsOf(await d.execute({ sql: 'SELECT * FROM categories WHERE uid=? ORDER BY id', args: [uid] }));
  return NextResponse.json({ cats });
}
