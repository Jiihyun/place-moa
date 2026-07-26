// 네이버 플레이스 대표사진 best-effort 추출 (프로토타입 한정 · 비공식 · 상업 런칭 전 교체 권장)
// 네이버 모바일 통합검색 SSR에서 ldb-phinf(로컬DB 대표사진)를 긁는다.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export async function naverPhoto(name: string, _areaHint?: string): Promise<string> {
  try {
    // 이름만으로 검색 (지역 힌트를 붙이면 네이버 통합검색이 장소 패널을 못 띄움).
    // AI가 이미 지점명("블루보틀 성수점")을 이름에 포함하므로 이름만으로 충분.
    const q = name.trim();
    const r = await fetch(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return '';
    const html = await r.text();
    const m = html.match(/https:\/\/search\.pstatic\.net\/common\/\?[^"'\s]*ldb-phinf[^"'\s]*/);
    return m ? m[0].replace(/&amp;/g, '&') : '';
  } catch { return ''; }
}
