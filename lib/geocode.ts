// 장소명 → 좌표·지역·주소. 카카오 키 있으면 카카오(한국 POI 정확), 없으면 Nominatim.
export type Geo = { lat: number | null; lng: number | null; region: string; address: string };

export async function geocode(name: string, areaHint: string): Promise<Geo> {
  const kakao = process.env.KAKAO_REST_KEY;
  try {
    if (kakao) {
      const core = (areaHint || '').replace(/^서울\s*/, '').replace(/(특별시|광역시|동|읍|면|리|가|구|시|로|길)$/, '').trim();
      // 전체 이름으로 먼저, 못 찾으면 핵심 상호(첫 단어)로 재시도 — 지역 힌트로 지점 선택
      const base = name.split(' ')[0];
      const queries = base && base !== name ? [name, base] : [name];
      for (const q of queries) {
        const r = await fetch(
          `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15`,
          { headers: { Authorization: `KakaoAK ${kakao}` }, signal: AbortSignal.timeout(6000) }
        );
        if (!r.ok) break;
        const docs = (await r.json()).documents || [];
        if (!docs.length) continue;
        let d = docs[0];
        if (core.length >= 2) {
          const hit = docs.find((x: any) => `${x.address_name} ${x.road_address_name} ${x.place_name}`.includes(core));
          if (hit) d = hit;
          else if (q === base) continue; // 핵심 상호 재시도인데 지역이 안 맞으면 다음으로 (오매칭 방지)
        }
        const address = d.road_address_name || d.address_name || '';
        const parts = (d.address_name || '').split(' ');
        const region = parts.slice(1, 3).join(' ') || areaHint;
        return { lat: parseFloat(d.y), lng: parseFloat(d.x), region, address };
      }
    }
    const q = `${name} ${areaHint}`;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=ko&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'moa-web/0.1 (place archiver)' }, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const j = await r.json();
      const d = j?.[0];
      if (d) {
        const parts = (d.display_name || '').split(',').map((s: string) => s.trim());
        const region = parts.length > 3 ? parts[parts.length - 4] : (areaHint || '미확인');
        return { lat: parseFloat(d.lat), lng: parseFloat(d.lon), region, address: d.display_name || '' };
      }
    }
  } catch { /* 지오코딩 실패 시 좌표 없이 저장 */ }
  return { lat: null, lng: null, region: areaHint.replace(/^서울\s*/, '') || '미확인', address: '' };
}
