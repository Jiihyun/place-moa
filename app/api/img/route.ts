// 이미지 프록시: 네이버 pstatic 이미지를 우리 도메인으로 흘려보냄 (핫링크 referer/CORS 회피)
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') || '';
  // 오픈 프록시 방지: pstatic.net 이미지만 허용
  if (!/^https:\/\/[a-z0-9-]+\.pstatic\.net\//i.test(u)) {
    return new Response('bad request', { status: 400 });
  }
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://m.search.naver.com/' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return new Response('', { status: 502 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': r.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=1209600, immutable',
      },
    });
  } catch {
    return new Response('', { status: 502 });
  }
}
