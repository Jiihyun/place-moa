import { NextResponse } from 'next/server';
import { db, catIdByName, rowsOf } from '@/lib/db';
import { getUid } from '@/lib/user';

// 받은 장소를 내 계정으로 복사
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid();
  const { id } = await params;
  const d = await db();
  const br = await d.execute({ sql: 'SELECT * FROM bundles WHERE id=?', args: [id] });
  if (!br.rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b: any = rowsOf(br)[0];
  const ids = JSON.parse(b.place_ids) as number[];
  const rows = rowsOf(await d.execute({
    sql: `SELECT p.*, c.name AS cat_name FROM places p LEFT JOIN categories c ON c.id=p.cat_id WHERE p.id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  }));
  let n = 0;
  for (const r of rows) {
    if (r.uid === uid) continue;
    await d.execute({
      sql: 'INSERT INTO places (uid,title,cat_id,region,lat,lng,source,source_url,memo) VALUES (?,?,?,?,?,?,?,?,?)',
      args: [uid, r.title, await catIdByName(uid, r.cat_name || '기타'), r.region, r.lat, r.lng, r.source, r.source_url, ''],
    });
    n++;
  }
  return NextResponse.json({ claimed: n });
}
