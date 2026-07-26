import { NextResponse } from 'next/server';
import { db, ensureCats, rowsOf } from '@/lib/db';
import { getUid } from '@/lib/user';

export async function GET() {
  const uid = await getUid();
  const d = await db();
  await ensureCats(uid);
  const cats = rowsOf(await d.execute({ sql: 'SELECT * FROM categories WHERE uid=? ORDER BY id', args: [uid] }));
  const places = rowsOf(await d.execute({ sql: 'SELECT * FROM places WHERE uid=? ORDER BY id DESC', args: [uid] }));
  const pendings = rowsOf(await d.execute({ sql: 'SELECT * FROM pendings WHERE uid=? ORDER BY id', args: [uid] }))
    .map(p => ({ ...p, candidates: JSON.parse(p.candidates) }));
  return NextResponse.json({ cats, places, pendings });
}
