import { db, rowsOf } from '@/lib/db';
import ClaimButton from './claim';

export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await db();
  const br = await d.execute({ sql: 'SELECT * FROM bundles WHERE id=?', args: [id] });
  if (!br.rows.length) {
    return <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 20px', textAlign: 'center', color: '#6a6a6a' }}>존재하지 않거나 만료된 공유 링크예요.</div>;
  }
  const b: any = rowsOf(br)[0];
  const ids = JSON.parse(b.place_ids) as number[];
  const rows = rowsOf(await d.execute({
    sql: `SELECT p.*, c.name AS cat_name, c.color AS cat_color, c.emoji AS cat_emoji
          FROM places p LEFT JOIN categories c ON c.id=p.cat_id
          WHERE p.id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  }));
  const sender = b.sender || '친구';
  const SRC_APP: Record<string, string> = { instagram: '인스타그램', youtube: '유튜브', naver: '네이버', other: '원본' };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100dvh', background: '#1c1b1a', padding: '30px 18px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          {b.title
            ? <><p style={{ margin: '0 0 4px', color: '#b9b5b0', fontSize: 13, fontWeight: 500 }}>{sender} 님이 공유했어요</p>
              <p style={{ margin: 0, color: '#fff', fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>{b.title} ✈️</p></>
            : <p style={{ margin: 0, color: '#fff', fontSize: 23, fontWeight: 700, lineHeight: 1.35 }}>{sender} 님이<br />공유한 장소예요 ✈️</p>}
        </div>
        <i className="ti ti-send" style={{ color: '#ff385c', fontSize: 32, transform: 'rotate(10deg)', flexShrink: 0 }} />
      </div>
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((p: any, i: number) => (
          <div key={p.id} style={{ background: '#fff', borderRadius: 14, padding: 13, display: 'flex', alignItems: 'center', gap: 12, transform: `rotate(${i % 2 ? 1.1 : -1.1}deg)`, boxShadow: '0 7px 18px rgba(0,0,0,.28)' }}>
            {p.photo
              ? <img src={p.photo.includes('pstatic.net') ? `/api/img?u=${encodeURIComponent(p.photo)}` : p.photo} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#eee' }} />
              : <div style={{ width: 46, height: 46, borderRadius: 10, background: `${p.cat_color || '#8a8a86'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{p.cat_emoji || '📍'}</div>}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#222' }}>{p.title}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6a6a6a' }}>{p.cat_name || '미분류'} · {p.region}{p.source_url ? <> · <a href={p.source_url} target="_blank" style={{ color: '#6a6a6a' }}>{SRC_APP[p.source] || '원본'} 바로가기 ›</a></> : ''}</p>
            </div>
          </div>
        ))}
      </div>
      <ClaimButton id={id} n={rows.length} />
    </div>
  );
}
