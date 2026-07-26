// 공유된 링크에서 제목·설명 텍스트 + 썸네일을 최대한 수집
export type LinkMeta = { source: string; title: string; text: string; thumb: string };

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function sourceOf(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.includes('instagram')) return 'instagram';
    if (h.includes('youtu')) return 'youtube';
    if (h.includes('naver')) return 'naver';
    if (h.includes('tiktok')) return 'tiktok';
    return 'other';
  } catch { return 'other'; }
}

function pick(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decodeEntities(m[1]) : '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");
}

export async function fetchMeta(url: string, caption?: string): Promise<LinkMeta> {
  const source = sourceOf(url);
  let title = '';
  let text = caption?.trim() || '';
  let thumb = '';

  try {
    if (source === 'youtube') {
      const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(6000) });
      if (o.ok) {
        const j = await o.json();
        title = j.title || '';
        thumb = j.thumbnail_url || '';
      }
    }
    // OG 태그 시도 (인스타는 로그인 없이 차단되는 경우가 많음 — 실패해도 캡션으로 진행)
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(8000), redirect: 'follow' });
    if (r.ok) {
      const html = (await r.text()).slice(0, 300_000);
      if (!title) title = pick(html, 'og:title') || pick(html, 'twitter:title');
      const desc = pick(html, 'og:description') || pick(html, 'description');
      if (desc) text = text ? `${text}\n${desc}` : desc;
      if (!thumb) thumb = pick(html, 'og:image') || pick(html, 'twitter:image');
    }
  } catch { /* 수집 실패는 치명적이지 않음 */ }

  if (!title) title = source === 'instagram' ? '인스타그램 게시물' : source === 'youtube' ? '유튜브 영상' : '공유된 링크';
  return { source, title, text, thumb };
}
