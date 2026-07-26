// Gemini Flash-Lite(최저가)로 텍스트에서 장소 추출. 키 없으면 데모 폴백.
export type Extracted = { name: string; category: '맛집' | '카페' | '술집·바' | '기타'; area_hint: string; lat?: number; lng?: number };

// 키 없이도 시연되도록 데모 폴백에는 좌표 내장 (실제 AI 경로는 지오코딩 사용)
const DEMO: Extracted[][] = [
  [
    { name: '블루보틀 성수점', category: '카페', area_hint: '성수동', lat: 37.5434, lng: 127.0560 },
    { name: '센터커피', category: '카페', area_hint: '서울숲', lat: 37.5470, lng: 127.0575 },
    { name: '어니언 성수점', category: '카페', area_hint: '성수동', lat: 37.5443, lng: 127.0578 },
  ],
  [{ name: '런던베이글뮤지엄 성수점', category: '맛집', area_hint: '성수동', lat: 37.5459, lng: 127.0546 }],
  [
    { name: '서서갈비', category: '맛집', area_hint: '연남동', lat: 37.5588, lng: 126.9240 },
    { name: '여얼커피', category: '카페', area_hint: '홍대', lat: 37.5550, lng: 126.9228 },
  ],
];
let demoIdx = 0;

export async function extractPlaces(title: string, text: string): Promise<{ places: Extracted[]; usedAI: boolean }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { places: DEMO[demoIdx++ % DEMO.length], usedAI: false };
  }
  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const prompt = `다음은 SNS 게시물/영상의 제목과 설명이다. 여기서 언급된 "실제 방문 가능한 장소(식당·카페·술집·상점 등)"의 공식 상호명을 추출하라.
- 상호명은 지역 접두어를 임의로 붙이지 말고 원문에 나온 그대로(지점명이 명시된 경우만 포함).
- category는 맛집|카페|술집·바|기타 중 하나.
- area_hint는 원문에서 유추되는 동네/지역(예: "서울 성수동"). 모르면 "서울".
- 장소가 없으면 빈 배열.
JSON 배열만 출력: [{"name":"...","category":"...","area_hint":"..."}]

제목: ${title}
내용: ${text.slice(0, 4000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  let arr: Extracted[] = [];
  try { arr = JSON.parse(raw); } catch { arr = []; }
  const valid = ['맛집', '카페', '술집·바', '기타'];
  arr = (Array.isArray(arr) ? arr : [])
    .filter(p => p && typeof p.name === 'string' && p.name.trim())
    .map(p => ({
      name: p.name.trim().slice(0, 60),
      category: (valid.includes(p.category) ? p.category : '기타') as Extracted['category'],
      area_hint: (p.area_hint || '서울').slice(0, 40),
    }))
    .slice(0, 8);
  return { places: arr, usedAI: true };
}
