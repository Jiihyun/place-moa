import { NextResponse } from 'next/server';
import { db, catIdByName, rowsOf, track } from '@/lib/db';
import { getUid } from '@/lib/user';
import { fetchMeta } from '@/lib/meta';
import { extractPlaces } from '@/lib/gemini';
import { geocode } from '@/lib/geocode';
import { naverPhoto } from '@/lib/naver';

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, caption, memo, forcePending } = await req.json();
  const userMemo = (memo || '').trim();
  if (!url || typeof url !== 'string') return NextResponse.json({ error: '링크를 입력해 주세요' }, { status: 400 });

  await track(uid, 'save_attempt', { hasCaption: !!caption });
  const meta = await fetchMeta(url, caption);
  let extracted;
  try {
    extracted = await extractPlaces(meta.title, meta.text);
  } catch (e: any) {
    await track(uid, 'save_fail', { reason: 'ai_error' });
    return NextResponse.json({ error: `AI 분석 실패: ${e.message}` }, { status: 502 });
  }
  if (extracted.places.length === 0) {
    await track(uid, 'save_fail', { reason: 'no_place', source: meta.source });
    return NextResponse.json({ error: '이 링크에서 장소를 찾지 못했어요. 캡션을 함께 붙여넣어 보세요.' }, { status: 422 });
  }

  const d = await db();
  // 지오코딩 (순차 — Nominatim rate limit 존중). 데모 폴백은 좌표 내장이라 스킵
  const enriched = [] as any[];
  for (const p of extracted.places) {
    const cat_id = await catIdByName(uid, p.category);
    const g = (p.lat != null && p.lng != null)
      ? { region: p.area_hint, address: '', lat: p.lat, lng: p.lng }
      : await geocode(p.name, p.area_hint);
    // 사진: 네이버 대표사진 → 실패 시 링크 썸네일(릴스) → 없으면 빈값(카테고리 플레이스홀더)
    const photo = (await naverPhoto(p.name, p.area_hint)) || meta.thumb || '';
    enriched.push({ name: p.name, cat_id, region: g.region, address: g.address, lat: g.lat, lng: g.lng, photo, memo: userMemo });
  }

  if (enriched.length === 1 && !forcePending) {
    const c = enriched[0];
    const info = await d.execute({
      sql: 'INSERT INTO places (uid,title,cat_id,region,address,photo,lat,lng,source,source_url,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: [uid, c.name, c.cat_id, c.region, c.address, c.photo, c.lat, c.lng, meta.source, url, userMemo],
    });
    const r = await d.execute({ sql: 'SELECT * FROM places WHERE id=?', args: [Number(info.lastInsertRowid)] });
    await track(uid, 'save_success', { source: meta.source, count: 1 });
    return NextResponse.json({ saved: rowsOf(r)[0], usedAI: extracted.usedAI });
  }

  const info = await d.execute({
    sql: 'INSERT INTO pendings (uid,video_title,source,source_url,candidates) VALUES (?,?,?,?,?)',
    args: [uid, meta.title, meta.source, url, JSON.stringify(enriched)],
  });
  const r = await d.execute({ sql: 'SELECT * FROM pendings WHERE id=?', args: [Number(info.lastInsertRowid)] });
  await track(uid, 'save_pending', { source: meta.source, count: enriched.length });
  return NextResponse.json({ pending: { ...rowsOf(r)[0], candidates: enriched }, usedAI: extracted.usedAI });
}
