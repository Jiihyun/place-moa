import { NextResponse } from 'next/server';
import { db, track } from '@/lib/db';
import { getUid } from '@/lib/user';

export async function POST(req: Request) {
  const uid = await getUid();
  const { title, sender, placeIds } = await req.json();
  if (!Array.isArray(placeIds) || placeIds.length === 0)
    return NextResponse.json({ error: 'placeIds required' }, { status: 400 });
  const d = await db();
  const id = crypto.randomUUID().slice(0, 8);
  await d.execute({
    sql: 'INSERT INTO bundles (id,uid,title,sender,place_ids) VALUES (?,?,?,?,?)',
    args: [id, uid, (title || '').slice(0, 60), (sender || '').slice(0, 30), JSON.stringify(placeIds)],
  });
  await track(uid, 'bundle_created', { count: placeIds.length });
  return NextResponse.json({ id, url: `/s/${id}` });
}
