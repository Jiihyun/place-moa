# 링크모아 iOS — Phase 2: 앱 내 저장 + 메타데이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 안에서 링크를 직접 담을 수 있게 한다 — "+" 버튼 → URL 붙여넣기 → 자동 메타데이터(제목·썸네일·본문) 추출 + 실패 시 수동 입력 폴백 → 폴더·메모와 함께 저장, 중복 URL은 감지해 기존 항목으로 안내.

**Architecture:** 순수 로직(URL 정규화·중복 판정·OG/oEmbed 파서)은 DB·네트워크와 분리해 jest로 TDD한다. 네트워크(fetchMetadata)는 `global.fetch` 목으로 파싱 경로를 TDD하고 실제 통신은 실기기로 검증한다. 썸네일은 `expo-file-system`으로 로컬 캐시(원본 URL 만료 대비). 저장 시트 UI는 프로토타입("모아") 기준. Phase 3(공유 익스텐션)가 재사용할 수 있도록 저장 로직(db.addItem + fetchMetadata + cacheThumbnail)은 UI와 분리한다.

**Tech Stack:** Phase 1 스택 + `expo-file-system`(썸네일), RN 내장 `fetch`(메타데이터). 새 UI 라이브러리 없음.

## Global Constraints

- **Phase 1의 Global Constraints를 모두 상속한다** (로컬 전용, iOS 우선, 앱스토어 미배포, UUID PK + updated_at, "모아" 프로토타입이 UI 기준, 테마 색, PAL 팔레트, 앱 이름 "링크모아", 앱 디렉터리 `moa/`).
- **Phase 2의 진입점은 앱 내 "+"(URL 직접 붙여넣기)** — 공유 시트 연동은 Phase 3다. Phase 2는 붙여넣기로 저장이 완결되게 만들고, Phase 3가 같은 저장 로직을 재사용한다.
- **메타데이터는 best-effort + 수동 폴백.** 유튜브는 oEmbed(공개 API), 그 외는 OG 태그 파싱. 실패하면 `metadata_status='failed'`로 두고 사용자가 제목을 직접 입력한다. 100% 성공을 가정하지 않는다.
- **URL 정규화로 중복을 막는다.** 추적 파라미터(`utm_*`, `igshid`, `fbclid`, `gclid`, `si`, `feature`) 제거 + 호스트 소문자화 + 끝 슬래시·프래그먼트 제거 후, 같은 정규화 URL이 이미 있으면 "이미 저장됨"으로 안내.
- **썸네일은 다운로드해 앱 내부(documentDirectory)에 저장**하고 `thumbnail_path`에 로컬 URI를 넣는다(원본 URL 만료 대비). 실패해도 저장 자체는 성공해야 한다(썸네일 없이).
- **저장은 항상 성공을 우선한다:** URL/제목/폴더만 있으면 즉시 DB 저장(`metadata_status='pending'`), 메타데이터·썸네일은 그 뒤 비동기로 채운다. 네트워크 실패가 저장을 막지 않는다.
- **데이터 모델은 Phase 1 스키마 그대로** — 컬럼 추가/마이그레이션 없음. `metadata_status ∈ {pending,done,failed}`, `thumbnail_path`(로컬 URI), `caption`(본문), `author`를 채운다.

---

## File Structure (Phase 2)

```
moa/src/
  lib/
    url.ts               # normalizeUrl, findDuplicate            [순수, TDD]
    metadata.ts          # parseOgTags, buildYouTubeOembedUrl     [순수, TDD]
                         # + fetchMetadata (fetch 목으로 TDD)
    thumbnail.ts         # cacheThumbnail (expo-file-system)      [기기 검증]
    db.ts                # +addFolder +addItem +updateItemMetadata (Phase 1 파일 확장)
    save.ts              # saveLink(): 저장 오케스트레이션(정규화·중복·insert·비동기 보강)
  components/
    SaveSheet.tsx        # 저장 바텀시트 (URL·제목·폴더칩·새폴더·메모·저장)
  screens/
    HomeScreen.tsx       # "+" 진입점 추가 (Phase 1 파일 확장)
  lib/__tests__/
    url.test.ts
    metadata.test.ts
```

---

## Task 1: URL 정규화 + 중복 판정 — TDD

**Files:**
- Create: `moa/src/lib/url.ts`
- Test: `moa/src/lib/__tests__/url.test.ts`

**Interfaces:**
- Consumes: `Item` (types.ts)
- Produces:
  - `normalizeUrl(raw: string): string` — 소문자 호스트, 추적 파라미터(`utm_source/utm_medium/utm_campaign/utm_term/utm_content/igshid/fbclid/gclid/si/feature`) 제거, 프래그먼트(`#...`) 제거, 경로 끝 슬래시 1개 제거(루트 `/`는 유지), 파싱 불가 시 `raw.trim()` 그대로 반환
  - `findDuplicate(items: Item[], raw: string): Item | null` — `item.url`을 정규화해 `raw` 정규화값과 일치하는 첫 항목, 없으면 null

- [ ] **Step 1: 실패 테스트 작성**

Create `moa/src/lib/__tests__/url.test.ts`:
```ts
import { normalizeUrl, findDuplicate } from '../url';
import type { Item } from '../../types';

function it_(over: Partial<Item>): Item {
  return {
    id: 'x', type: 'link', url: null, platform: '기타', title: '', caption: null,
    author: null, memo: null, thumbnail_path: null, folder_id: null, seen_at: null,
    metadata_status: 'done', created_at: 0, updated_at: 0, ...over,
  };
}

describe('normalizeUrl', () => {
  test('추적 파라미터 제거', () =>
    expect(normalizeUrl('https://youtube.com/shorts/abc?si=XYZ&feature=share'))
      .toBe('https://youtube.com/shorts/abc'));
  test('utm 제거하고 실제 쿼리는 유지', () =>
    expect(normalizeUrl('https://ex.com/p?utm_source=ig&id=5'))
      .toBe('https://ex.com/p?id=5'));
  test('호스트 소문자화 + 끝 슬래시 제거', () =>
    expect(normalizeUrl('https://Instagram.com/reel/AbC/')).toBe('https://instagram.com/reel/AbC'));
  test('프래그먼트 제거', () =>
    expect(normalizeUrl('https://ex.com/a#section')).toBe('https://ex.com/a'));
  test('루트 슬래시는 유지', () =>
    expect(normalizeUrl('https://ex.com/')).toBe('https://ex.com/'));
  test('파싱 불가하면 트림만', () =>
    expect(normalizeUrl('  not a url  ')).toBe('not a url'));
});

describe('findDuplicate', () => {
  const items = [it_({ id: 'a', url: 'https://youtube.com/shorts/abc?si=1' })];
  test('정규화 후 같으면 찾음', () =>
    expect(findDuplicate(items, 'https://youtube.com/shorts/abc?feature=x')?.id).toBe('a'));
  test('다르면 null', () =>
    expect(findDuplicate(items, 'https://youtube.com/shorts/zzz')).toBeNull());
  test('url 없는 항목은 무시', () =>
    expect(findDuplicate([it_({ id: 'b', url: null })], 'https://x.com')).toBeNull());
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest url`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create `moa/src/lib/url.ts`:
```ts
import type { Item } from '../types';

const TRACKING = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'igshid', 'fbclid', 'gclid', 'si', 'feature',
]);

export function normalizeUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.has(key)) u.searchParams.delete(key);
  }
  let out = u.toString();
  // 쿼리/프래그먼트 없는 경우에만 끝 슬래시 정리(루트는 유지)
  if (!u.search && u.pathname !== '/' && out.endsWith('/')) {
    out = out.slice(0, -1);
  }
  return out;
}

export function findDuplicate(items: Item[], raw: string): Item | null {
  const target = normalizeUrl(raw);
  for (const it of items) {
    if (it.url && normalizeUrl(it.url) === target) return it;
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest url`
Expected: PASS (9 tests).

> 참고: `URL`/`URLSearchParams`는 React Native(Hermes)와 jest 모두에서 전역 제공된다. `toString()`이 파라미터 삭제 후 쿼리가 비면 `?`를 남기지 않는지 테스트가 검증한다.

- [ ] **Step 5: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/url.ts moa/src/lib/__tests__/url.test.ts
git commit -m "feat(moa): url normalization + duplicate detection (TDD)"
```

---

## Task 2: OG/oEmbed 파서 — TDD

**Files:**
- Create: `moa/src/lib/metadata.ts` (파서 부분만; fetch는 Task 3에서 같은 파일에 추가)
- Test: `moa/src/lib/__tests__/metadata.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `parseOgTags(html: string): { title: string | null; description: string | null; image: string | null }` — `<meta property="og:title" content="...">` 형태에서 추출. `property`와 `name` 둘 다 인정, 속성 순서 무관, 없으면 null
  - `buildYouTubeOembedUrl(url: string): string | null` — youtube.com/youtu.be면 `https://www.youtube.com/oembed?url=<encoded>&format=json`, 아니면 null

- [ ] **Step 1: 실패 테스트 작성**

Create `moa/src/lib/__tests__/metadata.test.ts`:
```ts
import { parseOgTags, buildYouTubeOembedUrl } from '../metadata';

describe('parseOgTags', () => {
  test('og:title/description/image 추출', () => {
    const html = `<html><head>
      <meta property="og:title" content="맛있는 파스타">
      <meta property="og:description" content="5분 레시피">
      <meta property="og:image" content="https://x.com/t.jpg">
    </head></html>`;
    expect(parseOgTags(html)).toEqual({
      title: '맛있는 파스타', description: '5분 레시피', image: 'https://x.com/t.jpg',
    });
  });
  test('content가 property보다 앞에 와도 인정', () => {
    const html = `<meta content="제목" property="og:title">`;
    expect(parseOgTags(html).title).toBe('제목');
  });
  test('name= 형태도 인정', () => {
    const html = `<meta name="og:image" content="https://x.com/i.png">`;
    expect(parseOgTags(html).image).toBe('https://x.com/i.png');
  });
  test('없으면 null', () =>
    expect(parseOgTags('<html></html>')).toEqual({ title: null, description: null, image: null }));
});

describe('buildYouTubeOembedUrl', () => {
  test('youtube.com', () =>
    expect(buildYouTubeOembedUrl('https://youtube.com/shorts/abc'))
      .toBe('https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutube.com%2Fshorts%2Fabc&format=json'));
  test('youtu.be', () =>
    expect(buildYouTubeOembedUrl('https://youtu.be/xyz'))
      .toBe('https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2Fxyz&format=json'));
  test('그 외 null', () =>
    expect(buildYouTubeOembedUrl('https://instagram.com/reel/x')).toBeNull());
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest metadata`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create `moa/src/lib/metadata.ts`:
```ts
function metaContent(html: string, key: string): string | null {
  // property/name = key, content 순서 무관하게 매칭
  const attrs = `(?:property|name)\\s*=\\s*["']${key}["']`;
  const content = `content\\s*=\\s*["']([^"']*)["']`;
  const forward = new RegExp(`<meta[^>]*${attrs}[^>]*${content}[^>]*>`, 'i');
  const backward = new RegExp(`<meta[^>]*${content}[^>]*${attrs}[^>]*>`, 'i');
  const m = html.match(forward) ?? html.match(backward);
  return m ? m[1] : null;
}

export function parseOgTags(html: string): {
  title: string | null; description: string | null; image: string | null;
} {
  return {
    title: metaContent(html, 'og:title'),
    description: metaContent(html, 'og:description'),
    image: metaContent(html, 'og:image'),
  };
}

export function buildYouTubeOembedUrl(url: string): string | null {
  if (!/youtube\.com|youtu\.be/i.test(url)) return null;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest metadata`
Expected: PASS (7 tests).

- [ ] **Step 5: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/metadata.ts moa/src/lib/__tests__/metadata.test.ts
git commit -m "feat(moa): OG/oEmbed metadata parsers (TDD)"
```

---

## Task 3: fetchMetadata (네트워크) — fetch 목으로 TDD

**Files:**
- Modify: `moa/src/lib/metadata.ts` (fetchMetadata 추가)
- Modify: `moa/src/lib/__tests__/metadata.test.ts` (fetchMetadata 테스트 추가)

**Interfaces:**
- Consumes: `parseOgTags`, `buildYouTubeOembedUrl` (같은 파일), `detectPlatform` (platform.ts)
- Produces:
  - `type FetchedMeta = { platform: string; title: string | null; description: string | null; thumbnailUrl: string | null; author: string | null; status: 'done' | 'failed' }`
  - `fetchMetadata(url: string): Promise<FetchedMeta>` — 유튜브면 oEmbed JSON(`title`,`thumbnail_url`,`author_name`), 아니면 브라우저 UA로 HTML GET → parseOgTags. 네트워크/파싱 실패나 아무 필드도 못 얻으면 `status:'failed'`(그래도 platform은 채움). 예외를 던지지 않는다.

- [ ] **Step 1: 실패 테스트 작성 (metadata.test.ts에 append)**

Append to `moa/src/lib/__tests__/metadata.test.ts`:
```ts
import { fetchMetadata } from '../metadata';

describe('fetchMetadata', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test('유튜브는 oEmbed로 채운다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: '쇼츠 제목', thumbnail_url: 'https://i.ytimg.com/x.jpg', author_name: '채널' }),
    }) as any;
    const m = await fetchMetadata('https://youtube.com/shorts/abc');
    expect(m).toEqual({
      platform: 'YouTube', title: '쇼츠 제목', description: null,
      thumbnailUrl: 'https://i.ytimg.com/x.jpg', author: '채널', status: 'done',
    });
  });

  test('그 외는 OG 태그로 채운다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:title" content="글 제목"><meta property="og:image" content="https://x.com/t.jpg">`,
    }) as any;
    const m = await fetchMetadata('https://ex.com/article');
    expect(m.platform).toBe('기타');
    expect(m.title).toBe('글 제목');
    expect(m.thumbnailUrl).toBe('https://x.com/t.jpg');
    expect(m.status).toBe('done');
  });

  test('네트워크 예외면 status failed (throw 안 함)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    const m = await fetchMetadata('https://instagram.com/reel/x');
    expect(m.status).toBe('failed');
    expect(m.platform).toBe('Instagram');
    expect(m.title).toBeNull();
  });

  test('아무 필드도 못 얻으면 failed', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html></html>' }) as any;
    const m = await fetchMetadata('https://ex.com/empty');
    expect(m.status).toBe('failed');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest metadata`
Expected: FAIL — `fetchMetadata` 없음.

- [ ] **Step 3: 구현 (metadata.ts에 append)**

Append to `moa/src/lib/metadata.ts`:
```ts
import { detectPlatform } from './platform';

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export type FetchedMeta = {
  platform: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  author: string | null;
  status: 'done' | 'failed';
};

export async function fetchMetadata(url: string): Promise<FetchedMeta> {
  const platform = detectPlatform(url) ?? '기타';
  const base: FetchedMeta = {
    platform, title: null, description: null, thumbnailUrl: null, author: null, status: 'failed',
  };

  try {
    const oembed = buildYouTubeOembedUrl(url);
    if (oembed) {
      const res = await fetch(oembed);
      if (!res.ok) return base;
      const d = await res.json();
      const title = d.title ?? null;
      const thumbnailUrl = d.thumbnail_url ?? null;
      const author = d.author_name ?? null;
      const status = title || thumbnailUrl ? 'done' : 'failed';
      return { platform, title, description: null, thumbnailUrl, author, status };
    }

    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) return base;
    const html = await res.text();
    const og = parseOgTags(html);
    const status = og.title || og.image || og.description ? 'done' : 'failed';
    return { platform, title: og.title, description: og.description, thumbnailUrl: og.image, author: null, status };
  } catch {
    return base;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest metadata`
Expected: PASS (11 tests: 파서 7 + fetch 4).

- [ ] **Step 5: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/metadata.ts moa/src/lib/__tests__/metadata.test.ts
git commit -m "feat(moa): fetchMetadata (youtube oembed + og fetch, TDD w/ fetch mock)"
```

---

## Task 4: 썸네일 로컬 캐시 (expo-file-system)

**Files:**
- Create: `moa/src/lib/thumbnail.ts`
- Modify: `moa/package.json` (expo-file-system 설치)

**Interfaces:**
- Consumes: 없음(직접 `expo-file-system` 사용)
- Produces:
  - `cacheThumbnail(remoteUrl: string, itemId: string): Promise<string | null>` — 원격 이미지를 `documentDirectory/thumbnails/<itemId>.img`로 다운로드, 성공 시 로컬 `file://` URI 반환, 실패(네트워크·URL 없음)면 null. 폴더 없으면 생성.

- [ ] **Step 1: 의존성 설치**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa
npx expo install expo-file-system
```
Expected: 설치 성공, package.json에 `expo-file-system` 추가.

- [ ] **Step 2: 구현**

Create `moa/src/lib/thumbnail.ts`:
```ts
import * as FileSystem from 'expo-file-system';

const THUMB_DIR = FileSystem.documentDirectory + 'thumbnails/';

export async function cacheThumbnail(remoteUrl: string, itemId: string): Promise<string | null> {
  if (!remoteUrl) return null;
  try {
    const info = await FileSystem.getInfoAsync(THUMB_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(THUMB_DIR, { intermediates: true });
    }
    const dest = `${THUMB_DIR}${itemId}.img`;
    const result = await FileSystem.downloadAsync(remoteUrl, dest);
    if (result.status >= 200 && result.status < 300) return result.uri;
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit`
Expected: 에러 없음.

> 참고: `expo-file-system`은 네이티브 모듈이라 jest 단위테스트는 없다. 런타임 동작은 Task 6의 실기기 체크리스트(저장 후 상세·목록 썸네일 표시)로 검증한다. Phase 1에서 `expo-sqlite`와 동일한 원칙.

- [ ] **Step 4: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/thumbnail.ts moa/package.json moa/package-lock.json
git commit -m "feat(moa): local thumbnail cache via expo-file-system"
```

---

## Task 5: DB 쓰기 함수 (addFolder, addItem, updateItemMetadata)

**Files:**
- Modify: `moa/src/lib/db.ts`

**Interfaces:**
- Consumes: `Folder`, `Item` (types.ts), `newId` (uuid.ts), `PAL` (theme.ts), 기존 `getDb`
- Produces (async):
  - `addFolder(name: string): Promise<Folder>` — 다음 sort_order, 색은 `PAL[folderCount % PAL.length]`, remind 0, cycle 7. 생성한 Folder 반환.
  - `addItem(input: NewItemInput): Promise<string>` — 새 id 생성·insert, id 반환. `NewItemInput = { url: string | null; platform: string; title: string; caption?: string | null; author?: string | null; memo?: string | null; thumbnail_path?: string | null; folder_id: string | null; metadata_status?: 'pending' | 'done' | 'failed' }` (type 기본 'link', created_at/updated_at = now)
  - `updateItemMetadata(id: string, patch: MetaPatch): Promise<void>` — `MetaPatch = { title?: string; caption?: string | null; author?: string | null; thumbnail_path?: string | null; platform?: string; metadata_status?: 'pending' | 'done' | 'failed' }`. 전달된 필드만 갱신 + updated_at.

- [ ] **Step 1: 타입 export 추가 (db.ts 상단 import 아래)**

Add to `moa/src/lib/db.ts` (near the top, after imports):
```ts
export type NewItemInput = {
  url: string | null;
  platform: string;
  title: string;
  caption?: string | null;
  author?: string | null;
  memo?: string | null;
  thumbnail_path?: string | null;
  folder_id: string | null;
  metadata_status?: 'pending' | 'done' | 'failed';
};

export type MetaPatch = {
  title?: string;
  caption?: string | null;
  author?: string | null;
  thumbnail_path?: string | null;
  platform?: string;
  metadata_status?: 'pending' | 'done' | 'failed';
};
```

- [ ] **Step 2: 함수 구현 (db.ts 하단에 추가)**

Add to end of `moa/src/lib/db.ts`:
```ts
export async function addFolder(name: string): Promise<Folder> {
  const db = await getDb();
  const now = Date.now();
  const countRow = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM folders');
  const idx = countRow?.c ?? 0;
  const folder: Folder = {
    id: newId(), name, color: PAL[idx % PAL.length],
    remind: 0, cycle: 7, sort_order: idx, created_at: now, updated_at: now,
  };
  await db.runAsync(
    'INSERT INTO folders (id,name,color,remind,cycle,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    [folder.id, folder.name, folder.color, folder.remind, folder.cycle, folder.sort_order, now, now],
  );
  return folder;
}

export async function addItem(input: NewItemInput): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  const id = newId();
  await db.runAsync(
    `INSERT INTO items (id,type,url,platform,title,caption,author,memo,thumbnail_path,folder_id,seen_at,metadata_status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, 'link', input.url, input.platform, input.title, input.caption ?? null, input.author ?? null,
     input.memo ?? null, input.thumbnail_path ?? null, input.folder_id, null,
     input.metadata_status ?? 'pending', now, now],
  );
  return id;
}

export async function updateItemMetadata(id: string, patch: MetaPatch): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const vals: (string | null)[] = [];
  const set = (col: string, v: string | null | undefined) => {
    if (v !== undefined) { cols.push(`${col} = ?`); vals.push(v); }
  };
  set('title', patch.title);
  set('caption', patch.caption);
  set('author', patch.author);
  set('thumbnail_path', patch.thumbnail_path);
  set('platform', patch.platform);
  set('metadata_status', patch.metadata_status);
  if (cols.length === 0) return;
  cols.push('updated_at = ?'); vals.push(String(Date.now()));
  await db.runAsync(`UPDATE items SET ${cols.join(', ')} WHERE id = ?`, [...vals, id]);
}
```

> `updated_at`은 INTEGER 컬럼이지만 SQLite는 문자열 숫자도 정수로 저장한다(타입 친화). 다른 정수 바인딩과 섞이지 않게 `vals`는 `string | null`로 통일했다.

- [ ] **Step 3: 타입체크 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/db.ts
git commit -m "feat(moa): db write ops — addFolder, addItem, updateItemMetadata"
```

---

## Task 6: 저장 오케스트레이션(save.ts) + SaveSheet UI + Home "+" 진입점

**Files:**
- Create: `moa/src/lib/save.ts`
- Create: `moa/src/components/SaveSheet.tsx`
- Modify: `moa/src/screens/HomeScreen.tsx` (헤더에 "+" 버튼 + 시트 상태)

**Interfaces:**
- Consumes: `normalizeUrl`/`findDuplicate` (url.ts), `fetchMetadata` (metadata.ts), `cacheThumbnail` (thumbnail.ts), `addItem`/`updateItemMetadata`/`addFolder`/`listFolders`/`listItems` (db.ts), `detectPlatform` (platform.ts), `theme`, `Folder`
- Produces:
  - `save.ts`: `saveLink(input): Promise<{ status: 'saved' | 'duplicate'; id: string }>` — `input = { url: string; title: string; memo: string; folderId: string | null }`. `findDuplicate(existingItems, url)`면 `{status:'duplicate', id: 기존id}`. 아니면 `addItem`(pending) → 즉시 id 확보 → 백그라운드로 `fetchMetadata`+`cacheThumbnail` 돌려 `updateItemMetadata`(끝나면), `{status:'saved', id}` 반환. 시그니처: `saveLink(input: { url: string; title: string; memo: string; folderId: string | null }, existingItems: Item[]): Promise<{ status: 'saved' | 'duplicate'; id: string }>`
  - `SaveSheet.tsx`: `SaveSheet({ visible, folders, onClose, onSaved })` — Modal 바텀시트. onSaved(id) 콜백으로 목록 새로고침.

- [ ] **Step 1: save.ts 구현**

Create `moa/src/lib/save.ts`:
```ts
import type { Item } from '../types';
import { findDuplicate } from './url';
import { detectPlatform } from './platform';
import { fetchMetadata } from './metadata';
import { cacheThumbnail } from './thumbnail';
import { addItem, updateItemMetadata } from './db';

export type SaveInput = { url: string; title: string; memo: string; folderId: string | null };

export async function saveLink(
  input: SaveInput,
  existingItems: Item[],
): Promise<{ status: 'saved' | 'duplicate'; id: string }> {
  const dup = findDuplicate(existingItems, input.url);
  if (dup) return { status: 'duplicate', id: dup.id };

  const platform = detectPlatform(input.url) ?? '기타';
  const id = await addItem({
    url: input.url.trim(),
    platform,
    title: input.title.trim(),
    memo: input.memo.trim() || null,
    folder_id: input.folderId,
    metadata_status: 'pending',
  });

  // 저장은 이미 끝남. 메타데이터·썸네일은 뒤에서 채운다(실패해도 저장 유지).
  void enrich(id, input.url, input.title.trim());
  return { status: 'saved', id };
}

async function enrich(id: string, url: string, userTitle: string): Promise<void> {
  const meta = await fetchMetadata(url);
  let thumbPath: string | null = null;
  if (meta.thumbnailUrl) thumbPath = await cacheThumbnail(meta.thumbnailUrl, id);
  await updateItemMetadata(id, {
    // 사용자가 제목을 비웠으면 추출 제목으로 보완, 이미 적었으면 유지
    title: userTitle ? undefined : meta.title ?? undefined,
    caption: meta.description ?? undefined,
    author: meta.author ?? undefined,
    thumbnail_path: thumbPath ?? undefined,
    platform: meta.platform,
    metadata_status: meta.status,
  });
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: SaveSheet 구현**

Create `moa/src/components/SaveSheet.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { theme } from '../theme';
import type { Folder } from '../types';
import { listItems, addFolder } from '../lib/db';
import { saveLink } from '../lib/save';

export function SaveSheet({ visible, folders, onClose, onSaved }: {
  visible: boolean;
  folders: Folder[];
  onClose: () => void;
  onSaved: (id: string, status: 'saved' | 'duplicate') => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);
  const [newFolder, setNewFolder] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLocalFolders(folders); }, [folders]);
  useEffect(() => {
    if (visible) { setUrl(''); setTitle(''); setMemo(''); setFolderId(null); setNewFolder(''); }
  }, [visible]);

  const canSave = url.trim().length > 0 && title.trim().length > 0 && !busy;

  async function onCreateFolder() {
    const name = newFolder.trim();
    if (!name) return;
    if (localFolders.some((f) => f.name === name)) { Alert.alert('이미 있는 폴더예요'); return; }
    const f = await addFolder(name);
    setLocalFolders((prev) => [...prev, f]);
    setFolderId(f.id);
    setNewFolder('');
  }

  async function onSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      const items = await listItems();
      const res = await saveLink({ url, title, memo, folderId }, items);
      if (res.status === 'duplicate') Alert.alert('이미 저장된 링크예요', '기존 항목을 열어볼게요.');
      onSaved(res.id, res.status);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.title}>나중에 볼 것 담기</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={s.lab}>링크</Text>
          <TextInput style={s.inp} placeholder="링크를 붙여넣어 주세요" placeholderTextColor="#A99C89"
                     autoCapitalize="none" autoCorrect={false} value={url} onChangeText={setUrl} />
          <Text style={s.lab}>제목</Text>
          <TextInput style={s.inp} placeholder="제목을 적어주세요" placeholderTextColor="#A99C89"
                     value={title} onChangeText={setTitle} />
          <Text style={s.lab}>폴더</Text>
          <View style={s.chips}>
            {localFolders.map((f) => (
              <Pressable key={f.id} style={[s.chip, folderId === f.id && s.chipOn]} onPress={() => setFolderId(f.id)}>
                <View style={[s.dot, { backgroundColor: f.color }]} />
                <Text style={[s.chipT, folderId === f.id && s.chipTOn]}>{f.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.newRow}>
            <TextInput style={[s.inp, s.newInp]} placeholder="새 폴더 이름" placeholderTextColor="#A99C89"
                       value={newFolder} onChangeText={setNewFolder} onSubmitEditing={onCreateFolder} />
            <Pressable style={s.newBtn} onPress={onCreateFolder}><Text style={s.newBtnT}>＋ 만들기</Text></Pressable>
          </View>
          <Text style={s.lab}>메모 — 나중의 나에게 (선택)</Text>
          <TextInput style={[s.inp, s.memo]} placeholder="왜 저장했는지 한 줄" placeholderTextColor="#A99C89"
                     multiline value={memo} onChangeText={setMemo} />
          <Pressable style={[s.save, !canSave && s.saveOff]} onPress={onSave} disabled={!canSave}>
            <Text style={s.saveT}>{busy ? '담는 중…' : '저장하기'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', backgroundColor: theme.sheet,
    borderTopWidth: 1.5, borderTopColor: theme.ink, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 18, paddingTop: 8 },
  grab: { width: 34, height: 4, borderRadius: 9, backgroundColor: theme.line, alignSelf: 'center', marginBottom: 13 },
  title: { fontSize: 16, fontWeight: '800', color: theme.ink, marginBottom: 13 },
  lab: { fontSize: 10, fontWeight: '800', color: theme.dim, letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  inp: { borderWidth: 1.4, borderColor: theme.ink, borderRadius: 3, backgroundColor: '#fff',
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: theme.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1.4, borderColor: theme.line, borderRadius: 99, backgroundColor: '#fff' },
  chipOn: { borderColor: theme.ink },
  dot: { width: 6, height: 6, borderRadius: 99 },
  chipT: { fontSize: 11.5, fontWeight: '600', color: theme.dim },
  chipTOn: { color: theme.ink, fontWeight: '800' },
  newRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  newInp: { flex: 1 },
  newBtn: { paddingHorizontal: 13, justifyContent: 'center', backgroundColor: theme.ink, borderRadius: 3 },
  newBtnT: { color: theme.paper, fontSize: 11.5, fontWeight: '700' },
  memo: { height: 60, textAlignVertical: 'top' },
  save: { marginTop: 22, padding: 14, backgroundColor: theme.ink, borderRadius: 3, alignItems: 'center' },
  saveOff: { opacity: 0.3 },
  saveT: { color: theme.paper, fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 4: Home에 "+" 진입점 + 시트 연결**

Modify `moa/src/screens/HomeScreen.tsx`:

(a) 상단 import에 추가:
```tsx
import { useState } from 'react';
import { SaveSheet } from '../components/SaveSheet';
```
(`useState`가 이미 import돼 있으면 중복 추가하지 말 것.)

(b) 컴포넌트 함수 본문에서 상태 추가 (기존 useState들 옆):
```tsx
const [sheetOpen, setSheetOpen] = useState(false);
```

(c) 헤더 브랜드 줄(`<View style={s.top}>...</View>`)을 아래로 교체해 "+" 버튼을 넣는다:
```tsx
      <View style={[s.top, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={s.brand}>링크모아 <Text style={s.brandSub}>나중에 볼 것들</Text></Text>
        <Pressable onPress={() => setSheetOpen(true)} hitSlop={10}
                   style={{ width: 34, height: 34, borderRadius: 3, borderWidth: 1.5, borderColor: theme.ink,
                            alignItems: 'center', justifyContent: 'center', backgroundColor: theme.sheet }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.ink, marginTop: -2 }}>＋</Text>
        </Pressable>
      </View>
```
(`Pressable`가 HomeScreen import에 없으면 `react-native` import에 추가한다.)

(d) `</SafeAreaView>` 바로 앞에 시트를 추가:
```tsx
      <SaveSheet
        visible={sheetOpen}
        folders={folders}
        onClose={() => setSheetOpen(false)}
        onSaved={(id, status) => {
          reload();
          if (status === 'duplicate') navigation.navigate('Detail', { id });
        }}
      />
```

- [ ] **Step 5: 타입체크 + 테스트**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit && npm test
```
Expected: tsc 에러 없음. jest는 Phase 1(22) + url(9) + metadata(11) = 42 통과.

- [ ] **Step 6: 실기기 통합 수동 검증 (iPhone)**

Metro 실행(`npx expo start`) 상태에서 앱을 열고:
- [ ] 홈 우상단 "＋" → 저장 시트가 아래에서 올라온다.
- [ ] **유튜브 쇼츠 링크**를 붙여넣고 제목 적고 폴더 골라 저장 → 목록에 뜨고, 잠시 뒤 자동으로 **제목/썸네일**이 채워진다(oEmbed 성공).
- [ ] **일반 웹 기사 링크** 저장 → OG 제목/썸네일이 채워지면 표시된다.
- [ ] **인스타 링크** 저장 → 메타데이터가 실패해도(로그인 벽) 저장은 유지되고, 상세에서 제목 직접 입력한 게 보인다(수동 폴백).
- [ ] "새 폴더 이름" 입력 + 만들기 → 새 폴더 칩이 생기고 선택된다.
- [ ] **같은 유튜브 링크를 파라미터만 다르게(`?si=...`) 다시 저장** → "이미 저장된 링크예요" 알림 + 기존 상세로 이동.
- [ ] 앱 재실행 → 새로 담은 항목·썸네일이 유지된다(로컬 파일 + SQLite).

- [ ] **Step 7: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/save.ts moa/src/components/SaveSheet.tsx moa/src/screens/HomeScreen.tsx
git commit -m "feat(moa): in-app save sheet — paste link, auto metadata, folders, dedup"
```

---

## Self-Review (완료됨)

**Spec coverage(MVP 문서 + 프로토타입 대비):**
- 저장 시트(제목·폴더칩·새 폴더·메모) ✅ Task 6 · URL/플랫폼 판별 ✅ Task 1/기존 platform.ts · 유튜브 oEmbed ✅ Task 3 · OG 파싱 ✅ Task 2/3 · 실패 시 수동 폴백 ✅ Task 3(status failed)+Task 6(수동 제목) · 썸네일 로컬 저장 ✅ Task 4 · 중복 URL 정규화 + "이미 저장됨" ✅ Task 1+Task 6 · 저장 우선(비동기 보강) ✅ Task 6 save.ts.
- **의도적으로 제외(후속):** 공유 익스텐션(Phase 3), 알림(Phase 4), 이미지(갤러리) 저장 타입(프로토타입엔 있으나 Phase 2는 링크에 집중 — 이미지는 Phase 3 공유 흐름과 함께).

**Placeholder scan:** 모든 코드 스텝에 실제 코드. "적절히 처리" 류 없음. ✅

**Type consistency:** `NewItemInput`/`MetaPatch`(db.ts) ↔ save.ts 사용 일치. `FetchedMeta`(metadata.ts) ↔ save.ts enrich 일치. `normalizeUrl`/`findDuplicate` 시그니처 ↔ url.test/save.ts 일치. `saveLink(input, existingItems)` ↔ SaveSheet 호출 일치. HomeScreen이 이미 갖고 있는 `folders`/`reload`/`navigation`를 SaveSheet에 전달. ✅

---

## 다음 Phase 예고
- **Phase 3:** `expo-share-extension`으로 인스타·유튜브·사파리 공유 → App Group 인박스 → 메인 앱 수거 → **Task 6의 save.ts/SaveSheet 로직 재사용**. 이미지(갤러리) 저장 타입도 여기서.
- **Phase 4:** `expo-notifications` 폴더별 주기 리마인드(주기 드롭다운) + 항목별 개별 알림.
