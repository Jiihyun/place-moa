# 링크모아 iOS — Phase 1: 기반 + 데이터 + 핵심 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "모아" 프로토타입(브랜드만 "링크모아"로)을 네이티브 Expo(React Native) 앱의 뼈대로 구현한다 — 로컬 SQLite에 저장된 폴더·항목을 "아직 안 봤어요 / 전체" 탭, 폴더 필터, 검색으로 훑고, 상세를 열면 "본 것"으로 표시하고 삭제할 수 있는, **실기기에서 도는 앱**.

**Architecture:** Expo(RN + TypeScript) + React Navigation(native-stack) 2화면(Home, Detail). 데이터는 `expo-sqlite`(비동기 API) 단일 로컬 DB. 순수 로직(필터·포맷·플랫폼 판별)은 DB와 분리해 jest로 TDD하고, DB 래퍼와 화면은 실기기 수동 체크리스트로 검증(프로토타입 test 전략과 동일). 저장 흐름·메타데이터·공유 익스텐션·알림은 **Phase 2~4**로 분리(이 플랜에 없음).

**Tech Stack:** Expo SDK(최신 안정), TypeScript, React Navigation native-stack, expo-sqlite, jest-expo + @testing-library/react-native.

## Global Constraints

- **로컬 전용.** 서버·계정·네트워크 동기화 없음. 단, 미래 동기화 대비: 모든 PK는 UUID 문자열, 모든 행에 `updated_at`(epoch ms).
- **iOS 우선, 앱스토어 미배포.** 최종 설치는 Xcode로 개인 기기에 직접(개발용 서명). 이 플랜은 시뮬레이터/실기기 개발 실행까지만 다룬다.
- **"모아" 프로토타입(`/Users/jihyun/Downloads/moa-prototype.html`)이 UI·동작·문구의 기준(source of truth).** 기존 `2026-07-14-link-moa-mvp-design.md`는 참고이되, 충돌 시 프로토타입 우선(예: 카테고리→**폴더**, 폴더별 **주기 리마인드** 포함).
- **UI 문구는 한국어**, 프로토타입 문구 그대로("아직 안 봤어요", "전체", "담아둔 것", "남긴 메모가 없어요" 등).
- **앱 디렉터리:** 저장소 루트의 `moa/` 하위. `docs/`, `prototype/`는 그대로 둔다. 모든 npm/expo 명령은 `moa/`에서 실행.
- **앱 표시 이름(홈 화면)·헤더 브랜드는 "링크모아".** 내부 식별자(디렉터리 `moa/`, DB `moa.db`, slug `moa`)는 유지 — 사용자에게 안 보임.
- **폴더 리마인드 주기(cycle)는 사용자가 드롭다운/피커로 선택**(옵션: 1·3·7·14·30일 등). 구현은 Phase 4. Phase 1 스키마의 `cycle`은 기본값만 시드하고 UI는 만들지 않는다 — 마이그레이션 불필요.
- **데이터 모델(이 플랜에서 확정, 이후 상속):**
  - `folders(id, name, color, remind INTEGER, cycle INTEGER, sort_order, created_at, updated_at)`
  - `items(id, type, url, platform, title, caption, author, memo, thumbnail_path, folder_id, seen_at, metadata_status, created_at, updated_at)`
  - `seen_at IS NULL` = "안 본". `folder_id IS NULL` = 미분류. `metadata_status ∈ {pending,done,failed}`.
- **색상 팔레트(폴더 기본색, 프로토타입 PAL):** `['#2F4F3A','#E8552F','#3A5C8C','#8C5A2B','#6B4C8C','#A03050','#4C7A6B','#8C7A2B']`.
- **테마 색(프로토타입 :root):** ink `#12100E`, paper `#EFE9DF`, paper-2 `#E4DCCF`, line `#CFC4B2`, dim `#7C7264`, hi `#2F4F3A`, pop `#E8552F`, sheet `#F7F3EC`.

---

## File Structure (Phase 1)

```
moa/
  App.tsx                     # NavigationContainer + Stack(Home, Detail)
  src/
    theme.ts                  # 색상·간격 상수 (프로토타입 토큰)
    types.ts                  # Folder, Item 타입
    lib/
      uuid.ts                 # newId()
      format.ts               # ago(), platformEmoji()  [순수, TDD]
      platform.ts             # detectPlatform()          [순수, TDD]
      filter.ts               # filterItems()             [순수, TDD]
      db.ts                   # expo-sqlite 래퍼 + 스키마 + 시드 + 쿼리
    screens/
      HomeScreen.tsx          # 헤더·탭·검색·폴더칩·목록
      DetailScreen.tsx        # 상세·본 것 표시·삭제
    components/
      Row.tsx                 # 목록 한 줄
      FolderChips.tsx         # 폴더 필터 칩 바
      Tabs.tsx                # 안 봤어요 / 전체 세그먼트
      Empty.tsx               # 빈 상태
  src/lib/__tests__/
    format.test.ts
    platform.test.ts
    filter.test.ts
```

---

## Task 1: Expo 앱 스캐폴드 + 도구 세팅

**Files:**
- Create: `moa/` (create-expo-app 산출물 전체)
- Modify: `moa/package.json` (jest 스크립트·의존성)
- Create: `moa/jest.config.js`, `moa/App.tsx`(교체)

**Interfaces:**
- Consumes: 없음
- Produces: 실행 가능한 Expo 앱(빈 화면). `moa/`에서 `npx expo run:ios`로 시뮬레이터 부팅. `npm test`로 jest 동작.

- [ ] **Step 1: (선택) watchman 설치**

Run:
```bash
brew install watchman
```
Expected: 설치 완료(이미 있으면 skip). 실패해도 진행 가능(경고만).

- [ ] **Step 2: Expo 앱 생성**

Run:
```bash
cd /Users/jihyun/dev/link-moa
npx create-expo-app@latest moa --template blank-typescript
```
Expected: `moa/` 생성, `App.tsx`·`package.json`·`tsconfig.json` 포함. "Your project is ready!" 출력.

그다음 `moa/app.json`에서 표시 이름을 바꾼다 — `expo.name`을 `"링크모아"`로 수정(`slug`은 `"moa"` 유지). 홈 화면 앱 아이콘 라벨이 "링크모아"가 된다.

- [ ] **Step 3: 런타임·테스트 의존성 설치**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa
npx expo install expo-sqlite react-native-screens react-native-safe-area-context @react-navigation/native @react-navigation/native-stack
npm install --save-dev jest jest-expo @testing-library/react-native @types/jest
```
Expected: 설치 성공, `package.json`에 반영.

- [ ] **Step 4: jest 설정 추가**

Create `moa/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-svg))',
  ],
};
```

Modify `moa/package.json` — `"scripts"` 블록에 test 추가(기존 스크립트 유지):
```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "test": "jest"
}
```

- [ ] **Step 5: 스모크 테스트 작성**

Create `moa/src/lib/__tests__/smoke.test.ts`:
```ts
test('jest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: 테스트 실행(통과 확인)**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa && npm test
```
Expected: PASS (1 test).

- [ ] **Step 7: App.tsx를 최소 플레이스홀더로 교체**

Replace `moa/App.tsx`:
```tsx
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE9DF' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#12100E' }}>링크모아</Text>
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 8: 시뮬레이터에서 실행(수동 검증)**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa && npx expo run:ios
```
Expected: iOS 시뮬레이터가 뜨고 종이색 배경에 "모아" 텍스트 표시. (첫 빌드는 CocoaPods 설치로 수 분 소요.)

- [ ] **Step 9: 루트 .gitignore 확인 후 커밋**

`moa/.gitignore`는 create-expo-app이 생성함(node_modules, ios/, .expo/ 등 제외). 확인 후:
```bash
cd /Users/jihyun/dev/link-moa
git add moa/ docs/superpowers/plans/2026-07-20-moa-ios-phase1-foundation.md
git commit -m "feat(moa): scaffold Expo iOS app + jest"
```

---

## Task 2: 타입·테마·순수 로직(format, platform) — TDD

**Files:**
- Create: `moa/src/types.ts`, `moa/src/theme.ts`, `moa/src/lib/uuid.ts`, `moa/src/lib/format.ts`, `moa/src/lib/platform.ts`
- Test: `moa/src/lib/__tests__/format.test.ts`, `moa/src/lib/__tests__/platform.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Folder`, `type Item` (types.ts)
  - `theme` 객체(theme.ts): 위 Global Constraints의 색 + `PAL: string[]`
  - `newId(): string` (uuid.ts)
  - `ago(t: number, now?: number): string` — 프로토타입 규칙: <1시간 "N분 전", <1일 "N시간 전", 1일 "어제", <30일 "N일 전", 그 외 "N달 전". 최소 "1분 전".
  - `platformEmoji(p: string): string` — Instagram📸 / YouTube▶️ / 갤러리🖼 / 그 외🔗
  - `detectPlatform(url: string): 'Instagram'|'YouTube'|'기타'|null` — 빈 문자열이면 null

- [ ] **Step 1: 타입 정의**

Create `moa/src/types.ts`:
```ts
export type Folder = {
  id: string;
  name: string;
  color: string;
  remind: number;   // 0 | 1
  cycle: number;    // days
  sort_order: number;
  created_at: number;
  updated_at: number;
};

export type Item = {
  id: string;
  type: 'link' | 'image';
  url: string | null;
  platform: string;
  title: string;
  caption: string | null;
  author: string | null;
  memo: string | null;
  thumbnail_path: string | null;
  folder_id: string | null;
  seen_at: number | null;
  metadata_status: 'pending' | 'done' | 'failed';
  created_at: number;
  updated_at: number;
};
```

- [ ] **Step 2: 테마 상수**

Create `moa/src/theme.ts`:
```ts
export const theme = {
  ink: '#12100E',
  paper: '#EFE9DF',
  paper2: '#E4DCCF',
  line: '#CFC4B2',
  dim: '#7C7264',
  hi: '#2F4F3A',
  pop: '#E8552F',
  sheet: '#F7F3EC',
};

export const PAL = [
  '#2F4F3A', '#E8552F', '#3A5C8C', '#8C5A2B',
  '#6B4C8C', '#A03050', '#4C7A6B', '#8C7A2B',
];
```

- [ ] **Step 3: uuid 헬퍼**

Create `moa/src/lib/uuid.ts`:
```ts
export function newId(): string {
  // RFC4122 v4-ish; 로컬 PK/미래 동기화 키 용도로 충분
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

- [ ] **Step 4: format 실패 테스트 작성**

Create `moa/src/lib/__tests__/format.test.ts`:
```ts
import { ago, platformEmoji } from '../format';

const NOW = 1_000_000_000_000;
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

describe('ago', () => {
  test('30초 전은 최소 1분 전', () => expect(ago(NOW - 30_000, NOW)).toBe('1분 전'));
  test('5분 전', () => expect(ago(NOW - 5 * MIN, NOW)).toBe('5분 전'));
  test('3시간 전', () => expect(ago(NOW - 3 * HOUR, NOW)).toBe('3시간 전'));
  test('1일 전은 어제', () => expect(ago(NOW - 1 * DAY, NOW)).toBe('어제'));
  test('9일 전', () => expect(ago(NOW - 9 * DAY, NOW)).toBe('9일 전'));
  test('60일 전은 2달 전', () => expect(ago(NOW - 60 * DAY, NOW)).toBe('2달 전'));
});

describe('platformEmoji', () => {
  test('Instagram', () => expect(platformEmoji('Instagram')).toBe('📸'));
  test('YouTube', () => expect(platformEmoji('YouTube')).toBe('▶️'));
  test('갤러리', () => expect(platformEmoji('갤러리')).toBe('🖼'));
  test('기타 fallback', () => expect(platformEmoji('기타')).toBe('🔗'));
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest format`
Expected: FAIL — "Cannot find module '../format'".

- [ ] **Step 6: format 구현**

Create `moa/src/lib/format.ts`:
```ts
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

export function ago(t: number, now: number = Date.now()): string {
  const d = now - t;
  if (d < HOUR) return Math.max(1, Math.floor(d / MIN)) + '분 전';
  if (d < DAY) return Math.floor(d / HOUR) + '시간 전';
  const n = Math.floor(d / DAY);
  if (n === 1) return '어제';
  if (n < 30) return n + '일 전';
  return Math.floor(n / 30) + '달 전';
}

export function platformEmoji(p: string): string {
  if (p === 'Instagram') return '📸';
  if (p === 'YouTube') return '▶️';
  if (p === '갤러리') return '🖼';
  return '🔗';
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest format`
Expected: PASS (10 tests).

- [ ] **Step 8: platform 실패 테스트 작성**

Create `moa/src/lib/__tests__/platform.test.ts`:
```ts
import { detectPlatform } from '../platform';

test('instagram url', () => expect(detectPlatform('https://www.instagram.com/reel/x/')).toBe('Instagram'));
test('youtube.com url', () => expect(detectPlatform('https://youtube.com/shorts/abc')).toBe('YouTube'));
test('youtu.be url', () => expect(detectPlatform('https://youtu.be/abc')).toBe('YouTube'));
test('기타 url', () => expect(detectPlatform('https://example.com/x')).toBe('기타'));
test('빈 문자열은 null', () => expect(detectPlatform('   ')).toBeNull());
```

- [ ] **Step 9: 테스트 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest platform`
Expected: FAIL — 모듈 없음.

- [ ] **Step 10: platform 구현**

Create `moa/src/lib/platform.ts`:
```ts
export function detectPlatform(url: string): 'Instagram' | 'YouTube' | '기타' | null {
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  return url && url.trim() ? '기타' : null;
}
```

- [ ] **Step 11: 테스트 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest platform`
Expected: PASS (5 tests).

- [ ] **Step 12: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src
git commit -m "feat(moa): types, theme, format & platform helpers (TDD)"
```

---

## Task 3: 목록 필터 순수 로직 — TDD

**Files:**
- Create: `moa/src/lib/filter.ts`
- Test: `moa/src/lib/__tests__/filter.test.ts`

**Interfaces:**
- Consumes: `Item` (types.ts)
- Produces:
  - `type Tab = 'unseen' | 'all'`
  - `filterItems(items: Item[], opts: { tab: Tab; folderId: string; query: string }): Item[]`
    - `tab==='unseen'` → `seen_at == null`만
    - `folderId !== 'all'` → 해당 폴더만
    - `query` → title+memo+caption 소문자 부분일치
    - 항상 `created_at` 내림차순 정렬(새 것 먼저), 원본 배열 불변
  - `countUnseen(items: Item[]): number`

- [ ] **Step 1: 실패 테스트 작성**

Create `moa/src/lib/__tests__/filter.test.ts`:
```ts
import { filterItems, countUnseen } from '../filter';
import type { Item } from '../../types';

function it_(over: Partial<Item>): Item {
  return {
    id: over.id ?? 'x', type: 'link', url: null, platform: '기타',
    title: '', caption: null, author: null, memo: null, thumbnail_path: null,
    folder_id: null, seen_at: null, metadata_status: 'done',
    created_at: 0, updated_at: 0, ...over,
  };
}

const items: Item[] = [
  it_({ id: 'a', title: '파스타 레시피', folder_id: 'f1', seen_at: null, created_at: 100 }),
  it_({ id: 'b', title: '아침 루틴', folder_id: 'f2', seen_at: 50, created_at: 200 }),
  it_({ id: 'c', title: '성수 팝업', memo: '주말 웨이팅', folder_id: 'f1', seen_at: null, created_at: 300 }),
];

test('unseen 탭은 seen_at null만', () => {
  const r = filterItems(items, { tab: 'unseen', folderId: 'all', query: '' });
  expect(r.map(i => i.id)).toEqual(['c', 'a']); // created_at desc
});

test('all 탭은 전부, 최신순', () => {
  const r = filterItems(items, { tab: 'all', folderId: 'all', query: '' });
  expect(r.map(i => i.id)).toEqual(['c', 'b', 'a']);
});

test('폴더 필터', () => {
  const r = filterItems(items, { tab: 'all', folderId: 'f1', query: '' });
  expect(r.map(i => i.id)).toEqual(['c', 'a']);
});

test('검색은 title+memo+caption 부분일치', () => {
  const r = filterItems(items, { tab: 'all', folderId: 'all', query: '웨이팅' });
  expect(r.map(i => i.id)).toEqual(['c']);
});

test('원본 배열 불변', () => {
  const before = items.map(i => i.id);
  filterItems(items, { tab: 'unseen', folderId: 'all', query: '' });
  expect(items.map(i => i.id)).toEqual(before);
});

test('countUnseen', () => {
  expect(countUnseen(items)).toBe(2);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest filter`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: filter 구현**

Create `moa/src/lib/filter.ts`:
```ts
import type { Item } from '../types';

export type Tab = 'unseen' | 'all';

export function filterItems(
  items: Item[],
  opts: { tab: Tab; folderId: string; query: string },
): Item[] {
  const q = (opts.query || '').toLowerCase().trim();
  let v = items.filter((i) => {
    if (opts.tab === 'unseen' && i.seen_at != null) return false;
    if (opts.folderId !== 'all' && i.folder_id !== opts.folderId) return false;
    if (q) {
      const hay = ((i.title || '') + (i.memo || '') + (i.caption || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return v.sort((a, b) => b.created_at - a.created_at);
}

export function countUnseen(items: Item[]): number {
  return items.filter((i) => i.seen_at == null).length;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx jest filter`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/filter.ts moa/src/lib/__tests__/filter.test.ts
git commit -m "feat(moa): pure list filter logic (TDD)"
```

---

## Task 4: SQLite 래퍼 + 스키마 + 시드 + 쿼리

**Files:**
- Create: `moa/src/lib/db.ts`

**Interfaces:**
- Consumes: `Folder`, `Item` (types.ts), `newId()` (uuid.ts)
- Produces (모든 함수 async):
  - `getDb(): Promise<SQLite.SQLiteDatabase>` — 최초 호출 시 스키마 생성 + 비어 있으면 시드
  - `listFolders(): Promise<Folder[]>` — sort_order, created_at 순
  - `listItems(): Promise<Item[]>` — created_at desc (전체 로드; 필터는 순수 로직이 담당)
  - `getItem(id: string): Promise<Item | null>`
  - `markSeen(id: string): Promise<void>` — seen_at이 null일 때만 now로 설정
  - `deleteItem(id: string): Promise<void>`
  - `resetToSeed(): Promise<void>` — 두 테이블 비우고 재시드(개발용)

- [ ] **Step 1: db 모듈 구현(스키마 + 시드)**

Create `moa/src/lib/db.ts`:
```ts
import * as SQLite from 'expo-sqlite';
import type { Folder, Item } from '../types';
import { newId } from './uuid';

let _db: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  remind INTEGER NOT NULL DEFAULT 0,
  cycle INTEGER NOT NULL DEFAULT 7,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL DEFAULT 'link',
  url TEXT,
  platform TEXT NOT NULL DEFAULT '기타',
  title TEXT NOT NULL DEFAULT '',
  caption TEXT,
  author TEXT,
  memo TEXT,
  thumbnail_path TEXT,
  folder_id TEXT,
  seen_at INTEGER,
  metadata_status TEXT NOT NULL DEFAULT 'done',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync('moa.db');
  await db.execAsync(SCHEMA);
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM folders');
  if (!row || row.c === 0) await seed(db);
  _db = db;
  return db;
}

async function seed(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = Date.now();
  const DAY = 86_400_000;
  const folders: Omit<Folder, 'created_at' | 'updated_at'>[] = [
    { id: 'f1', name: '자기계발', color: '#2F4F3A', remind: 0, cycle: 7, sort_order: 0 },
    { id: 'f2', name: '요리 레시피', color: '#E8552F', remind: 1, cycle: 3, sort_order: 1 },
    { id: 'f3', name: '팝업·장소', color: '#3A5C8C', remind: 1, cycle: 7, sort_order: 2 },
    { id: 'f4', name: '옷·쇼핑', color: '#8C5A2B', remind: 0, cycle: 14, sort_order: 3 },
    { id: 'f5', name: '책', color: '#6B4C8C', remind: 0, cycle: 14, sort_order: 4 },
  ];
  for (const f of folders) {
    await db.runAsync(
      'INSERT INTO folders (id,name,color,remind,cycle,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [f.id, f.name, f.color, f.remind, f.cycle, f.sort_order, now, now],
    );
  }
  const items: Array<Partial<Item> & { title: string; folder_id: string; platform: string; created_at: number; seen_at: number | null }> = [
    { title: '자취생 5분 마늘버터 새우 파스타', url: 'https://www.instagram.com/reel/xxx1/', platform: 'Instagram', author: 'jipbap_diary',
      memo: '주말에 해먹기. 새우는 냉동으로 사도 된다고 함',
      caption: '냉동새우로 5분만에 마늘버터 새우파스타 🍤 자취생 필수 레시피\n\n재료: 냉동새우 10마리, 스파게티 100g, 마늘 5쪽, 버터 2스푼',
      folder_id: 'f2', seen_at: null, created_at: now - 9 * DAY },
    { title: '아침 15분 루틴으로 하루를 바꾸는 법', url: 'https://youtube.com/shorts/xxx2', platform: 'YouTube', author: '모닝루틴랩',
      caption: '아침 15분이 하루를 바꾼다 | 미라클모닝 3단계\n\n1. 기상 후 물 한 잔\n2. 5분 스트레칭\n3. 오늘 할 일 3가지만 적기',
      folder_id: 'f1', seen_at: null, created_at: now - 5 * DAY },
    { title: '성수 재팬디 감성 팝업 (7/31까지)', url: 'https://www.instagram.com/p/xxx3/', platform: 'Instagram', author: 'seoul_popup',
      memo: '주말 오후엔 웨이팅 1시간이라고 댓글에 있었음',
      caption: '성수동에 새로 생긴 재팬디 감성 팝업 ✨\n7월 31일까지만 열어요\n\n📍 성수동 연무장길\n⏰ 11:00 - 20:00',
      folder_id: 'f3', seen_at: null, created_at: now - 4 * DAY },
    { title: '키 작은 사람 여름 코디 3가지', url: 'https://youtube.com/shorts/xxx4', platform: 'YouTube', author: 'daily_fit',
      caption: '키 작아도 다리 길어 보이는 여름 코디 3가지\n\n1. 하이웨스트 + 크롭\n2. 같은 톤으로 맞추기',
      folder_id: 'f4', seen_at: now - 13 * DAY, created_at: now - 14 * DAY },
    { title: '올해 읽은 책 중 최고 — 물고기는 존재하지 않는다', url: 'https://www.instagram.com/reel/xxx5/', platform: 'Instagram', author: 'book_moment',
      memo: '도서관에 있는지 확인',
      caption: '올해 읽은 책 중 최고 📚\n"물고기는 존재하지 않는다" - 룰루 밀러',
      folder_id: 'f5', seen_at: null, created_at: now - 2 * 3_600_000 },
  ];
  for (const i of items) {
    await db.runAsync(
      `INSERT INTO items (id,type,url,platform,title,caption,author,memo,thumbnail_path,folder_id,seen_at,metadata_status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId(), 'link', i.url ?? null, i.platform, i.title, i.caption ?? null, i.author ?? null,
       i.memo ?? null, null, i.folder_id, i.seen_at, 'done', i.created_at, i.created_at],
    );
  }
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db.getAllAsync<Folder>('SELECT * FROM folders ORDER BY sort_order ASC, created_at ASC');
}

export async function listItems(): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>('SELECT * FROM items ORDER BY created_at DESC');
}

export async function getItem(id: string): Promise<Item | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Item>('SELECT * FROM items WHERE id = ?', [id]);
  return r ?? null;
}

export async function markSeen(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync('UPDATE items SET seen_at = ?, updated_at = ? WHERE id = ? AND seen_at IS NULL', [now, now, id]);
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

export async function resetToSeed(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM items; DELETE FROM folders;');
  await seed(db);
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/db.ts
git commit -m "feat(moa): sqlite wrapper, schema & seed"
```

> DB 동작은 네이티브 모듈이라 jest 단위테스트 대신 Task 6의 실기기 수동 체크리스트로 검증한다(프로토타입 test 전략과 동일).

---

## Task 5: 컴포넌트(Tabs, FolderChips, Row, Empty) + Home 화면

**Files:**
- Create: `moa/src/components/Tabs.tsx`, `moa/src/components/FolderChips.tsx`, `moa/src/components/Row.tsx`, `moa/src/components/Empty.tsx`
- Create: `moa/src/screens/HomeScreen.tsx`
- Modify: `moa/App.tsx` (네비게이션 구성)

**Interfaces:**
- Consumes: `theme` (theme.ts), `Folder`/`Item` (types.ts), `ago`/`platformEmoji` (format.ts), `filterItems`/`countUnseen`/`Tab` (filter.ts), `listFolders`/`listItems` (db.ts)
- Produces:
  - `App.tsx`: Stack Navigator, 라우트 `Home`, `Detail`(params: `{ id: string }`)
  - `HomeScreen`: `navigation` prop으로 `Detail`로 이동, 화면 포커스 시 데이터 재로드
  - 컴포넌트 props:
    - `Tabs({ tab, unseenCount, allCount, onChange })`
    - `FolderChips({ folders, activeId, counts, onChange })` — counts: `Record<string, number>`, activeId: `'all' | folderId`
    - `Row({ item, folder, onPress })`
    - `Empty({ tab, filtered })`

- [ ] **Step 1: Tabs 컴포넌트**

Create `moa/src/components/Tabs.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { Tab } from '../lib/filter';

export function Tabs({ tab, unseenCount, allCount, onChange }: {
  tab: Tab; unseenCount: number; allCount: number; onChange: (t: Tab) => void;
}) {
  return (
    <View style={s.wrap}>
      <Pressable style={[s.tab, tab === 'unseen' && s.on]} onPress={() => onChange('unseen')}>
        <Text style={[s.t, tab === 'unseen' && s.tOn]}>아직 안 봤어요</Text>
        {unseenCount > 0 && <Text style={s.badge}>{unseenCount}</Text>}
      </Pressable>
      <Pressable style={[s.tab, s.last, tab === 'all' && s.on]} onPress={() => onChange('all')}>
        <Text style={[s.t, tab === 'all' && s.tOn]}>전체 {allCount}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', marginHorizontal: 18, marginTop: 14, borderWidth: 1.5, borderColor: theme.ink, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.sheet },
  tab: { flex: 1, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRightWidth: 1.5, borderRightColor: theme.ink },
  last: { borderRightWidth: 0 },
  on: { backgroundColor: theme.ink },
  t: { fontSize: 12.5, fontWeight: '700', color: theme.dim },
  tOn: { color: theme.paper },
  badge: { fontSize: 10, fontWeight: '800', color: '#fff', backgroundColor: theme.pop, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 99, overflow: 'hidden' },
});
```

- [ ] **Step 2: FolderChips 컴포넌트**

Create `moa/src/components/FolderChips.tsx`:
```tsx
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { Folder } from '../types';

export function FolderChips({ folders, activeId, counts, onChange }: {
  folders: Folder[]; activeId: string; counts: Record<string, number>; onChange: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      <Chip label={`전체 ${counts.all ?? 0}`} on={activeId === 'all'} onPress={() => onChange('all')} />
      {folders.map((f) => (
        <Chip key={f.id} label={`${f.name} ${counts[f.id] ?? 0}`} dot={f.color} bell={f.remind === 1}
              on={activeId === f.id} onPress={() => onChange(f.id)} />
      ))}
    </ScrollView>
  );
}

function Chip({ label, dot, bell, on, onPress }: { label: string; dot?: string; bell?: boolean; on: boolean; onPress: () => void; }) {
  return (
    <Pressable style={[s.chip, on && s.chipOn]} onPress={onPress}>
      {dot && <View style={[s.dot, { backgroundColor: dot }]} />}
      <Text style={[s.label, on && s.labelOn]}>{label}</Text>
      {bell && <Text style={s.bell}>🔔</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { gap: 5, paddingVertical: 9, paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1.3, borderColor: theme.line, borderRadius: 99, backgroundColor: theme.sheet },
  chipOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  dot: { width: 6, height: 6, borderRadius: 99 },
  label: { fontSize: 11, fontWeight: '600', color: theme.dim },
  labelOn: { color: theme.paper },
  bell: { fontSize: 9 },
});
```

- [ ] **Step 3: Row 컴포넌트**

Create `moa/src/components/Row.tsx`:
```tsx
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { ago, platformEmoji } from '../lib/format';
import type { Folder, Item } from '../types';

export function Row({ item, folder, onPress }: { item: Item; folder: Folder | null; onPress: () => void; }) {
  const preview = item.memo ? `✏️ ${item.memo}` : item.caption ? item.caption.split('\n')[0] : '';
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={s.left}>
        <Text style={s.title} numberOfLines={2}>
          {item.seen_at == null && <Text style={s.newdot}>● </Text>}{item.title}
        </Text>
        {!!preview && <Text style={s.body} numberOfLines={2}>{preview}</Text>}
        <View style={s.meta}>
          {folder && <Text style={[s.tag, { color: folder.color, borderColor: folder.color }]}>{folder.name}</Text>}
          <Text style={s.plat}>{platformEmoji(item.platform)} {item.platform}</Text>
          <Text style={s.date}>{ago(item.created_at)}</Text>
        </View>
      </View>
      <View style={s.thumbBox}>
        {item.thumbnail_path
          ? <Image style={s.thumb} source={{ uri: item.thumbnail_path }} />
          : <View style={[s.thumb, s.thumbPh]}><Text style={{ fontSize: 24 }}>{platformEmoji(item.platform)}</Text></View>}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 11, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.line, alignItems: 'flex-start' },
  left: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 19, color: theme.ink },
  newdot: { color: theme.pop, fontSize: 10 },
  body: { fontSize: 11.5, color: theme.dim, lineHeight: 17, marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  tag: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, overflow: 'hidden' },
  plat: { fontSize: 9.5, color: theme.dim, fontWeight: '600' },
  date: { fontSize: 9.5, color: '#A99C89', marginLeft: 'auto' },
  thumbBox: { width: 76 },
  thumb: { width: 76, height: 76, borderRadius: 3, borderWidth: 1.3, borderColor: theme.ink, backgroundColor: theme.paper2 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 4: Empty 컴포넌트**

Create `moa/src/components/Empty.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { Tab } from '../lib/filter';

export function Empty({ tab, filtered }: { tab: Tab; filtered: boolean }) {
  const em = tab === 'unseen' ? '🎉' : '🗂';
  const h = tab === 'unseen' ? (filtered ? '여기엔 안 본 게 없어요' : '다 확인했어요!') : '아직 담은 게 없어요';
  const p = tab === 'unseen' ? '담아둔 걸 전부 열어봤네요' : '공유해서 담아보세요';
  return (
    <View style={s.wrap}>
      <Text style={s.em}>{em}</Text>
      <Text style={s.h}>{h}</Text>
      <Text style={s.p}>{p}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 64, paddingHorizontal: 22, alignItems: 'center' },
  em: { fontSize: 34 },
  h: { fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 5, color: theme.ink },
  p: { fontSize: 12, color: theme.dim, lineHeight: 19, textAlign: 'center' },
});
```

- [ ] **Step 5: HomeScreen**

Create `moa/src/screens/HomeScreen.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import type { Folder, Item } from '../types';
import { listFolders, listItems } from '../lib/db';
import { filterItems, countUnseen, type Tab } from '../lib/filter';
import { Tabs } from '../components/Tabs';
import { FolderChips } from '../components/FolderChips';
import { Row } from '../components/Row';
import { Empty } from '../components/Empty';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<Tab>('unseen');
  const [folderId, setFolderId] = useState('all');
  const [query, setQuery] = useState('');

  const reload = useCallback(() => {
    listFolders().then(setFolders);
    listItems().then(setItems);
  }, []);
  useFocusEffect(reload);

  const pool = tab === 'unseen' ? items.filter((i) => i.seen_at == null) : items;
  const counts: Record<string, number> = { all: pool.length };
  folders.forEach((f) => { counts[f.id] = pool.filter((i) => i.folder_id === f.id).length; });
  const visible = filterItems(items, { tab, folderId, query });
  const folderById = (id: string | null) => folders.find((f) => f.id === id) ?? null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.top}>
        <Text style={s.brand}>링크모아 <Text style={s.brandSub}>나중에 볼 것들</Text></Text>
      </View>
      <Tabs tab={tab} unseenCount={countUnseen(items)} allCount={items.length}
            onChange={(t) => { setTab(t); setFolderId('all'); }} />
      <View style={s.filters}>
        <TextInput style={s.search} placeholder="제목 · 메모 검색" placeholderTextColor="#A99C89"
                   value={query} onChangeText={setQuery} />
      </View>
      <FolderChips folders={folders} activeId={folderId} counts={counts} onChange={setFolderId} />
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Row item={item} folder={folderById(item.folder_id)}
               onPress={() => navigation.navigate('Detail', { id: item.id })} />
        )}
        ListEmptyComponent={<Empty tab={tab} filtered={folderId !== 'all' || query.length > 0} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.paper },
  top: { paddingHorizontal: 18, paddingTop: 8 },
  brand: { fontSize: 24, fontWeight: '800', color: theme.ink, letterSpacing: -0.5 },
  brandSub: { fontSize: 10.5, fontWeight: '500', color: theme.dim },
  filters: { paddingHorizontal: 18, paddingTop: 13 },
  search: { borderWidth: 1.4, borderColor: theme.ink, borderRadius: 3, backgroundColor: theme.sheet, paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, color: theme.ink },
  list: { paddingHorizontal: 18, paddingBottom: 40 },
});
```

- [ ] **Step 6: App.tsx 네비게이션 구성**

Replace `moa/App.tsx`:
```tsx
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { DetailScreen } from './src/screens/DetailScreen';

export type RootStackParamList = {
  Home: undefined;
  Detail: { id: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Detail" component={DetailScreen}
            options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
```

> 참고: 이 단계에서 `DetailScreen`은 아직 없음 → Task 6에서 만든다. Task 6까지는 `npx tsc --noEmit`가 Detail import에서 실패하는 게 정상. 화면 확인은 Task 6 완료 후 함께 한다.

- [ ] **Step 7: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/components moa/src/screens/HomeScreen.tsx moa/App.tsx
git commit -m "feat(moa): home screen — tabs, chips, search, list"
```

---

## Task 6: Detail 화면 + 실기기 통합 검증

**Files:**
- Create: `moa/src/screens/DetailScreen.tsx`

**Interfaces:**
- Consumes: `getItem`/`markSeen`/`deleteItem`/`listFolders` (db.ts), `ago`/`platformEmoji` (format.ts), `theme`, `RootStackParamList`
- Produces: `DetailScreen` — 진입 시 `markSeen`, 뒤로가기, "원본 열기"(Linking), "삭제"→Home 복귀

- [ ] **Step 1: DetailScreen 구현**

Create `moa/src/screens/DetailScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../theme';
import type { Folder, Item } from '../types';
import { getItem, markSeen, deleteItem, listFolders } from '../lib/db';
import { ago, platformEmoji } from '../lib/format';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;

export function DetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [item, setItem] = useState<Item | null>(null);
  const [folder, setFolder] = useState<Folder | null>(null);

  useEffect(() => {
    (async () => {
      await markSeen(id);
      const it = await getItem(id);
      setItem(it);
      if (it?.folder_id) {
        const fs = await listFolders();
        setFolder(fs.find((f) => f.id === it.folder_id) ?? null);
      }
    })();
  }, [id]);

  if (!item) return <SafeAreaView style={s.safe} />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.nav}>
        <Pressable onPress={() => navigation.goBack()}><Text style={s.back}>←</Text></Pressable>
        <Text style={s.navT}>담아둔 것</Text>
      </View>
      <ScrollView>
        <View style={s.hero}><Text style={{ fontSize: 56 }}>{platformEmoji(item.platform)}</Text></View>
        <View style={s.body}>
          <View style={s.tags}>
            {folder && <Text style={[s.tag, { color: folder.color, borderColor: folder.color }]}>{folder.name}</Text>}
            <Text style={s.plat}>{platformEmoji(item.platform)} {item.platform}</Text>
            <Text style={s.date}>{ago(item.created_at)}에 담음</Text>
          </View>
          <Text style={s.title}>{item.title}</Text>
          {!!item.author && <Text style={s.author}>@{item.author}</Text>}

          <View style={s.sec}>
            <Text style={s.sl}>✏️ 내 메모</Text>
            {item.memo
              ? <Text style={s.memo}>{item.memo}</Text>
              : <Text style={[s.memo, s.memoNone]}>남긴 메모가 없어요</Text>}
          </View>

          {!!item.caption && (
            <View style={s.sec}>
              <Text style={s.sl}>📄 게시글 본문</Text>
              <Text style={s.cap}>{item.caption}</Text>
            </View>
          )}

          <Pressable style={s.open} onPress={() => item.url && Linking.openURL(item.url)}>
            <Text style={s.openT}>원본 열기 ↗</Text>
          </Pressable>
          <Pressable style={s.del} onPress={async () => { await deleteItem(item.id); navigation.goBack(); }}>
            <Text style={s.delT}>삭제</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.paper },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.line },
  back: { fontSize: 16, fontWeight: '800', color: theme.ink, paddingHorizontal: 6, paddingVertical: 4 },
  navT: { fontSize: 12, fontWeight: '700', color: theme.dim },
  hero: { height: 210, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper2, borderBottomWidth: 1.5, borderBottomColor: theme.ink },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 40 },
  tags: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  tag: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, overflow: 'hidden' },
  plat: { fontSize: 9.5, color: theme.dim, fontWeight: '600' },
  date: { fontSize: 9.5, color: '#A99C89', marginLeft: 'auto' },
  title: { fontSize: 19, fontWeight: '800', lineHeight: 26, color: theme.ink, letterSpacing: -0.3 },
  author: { fontSize: 11.5, color: theme.dim, marginTop: 6, fontWeight: '600' },
  sec: { marginTop: 20 },
  sl: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: theme.dim, marginBottom: 7 },
  memo: { fontSize: 12.5, lineHeight: 20, backgroundColor: '#FFF8E6', borderWidth: 1.3, borderColor: '#E0CF9A', borderRadius: 3, padding: 12, color: '#4A3F22' },
  memoNone: { backgroundColor: theme.sheet, borderColor: theme.line, color: '#A99C89', fontStyle: 'italic' },
  cap: { fontSize: 12.5, lineHeight: 21, color: '#3A342C', backgroundColor: theme.sheet, borderWidth: 1.3, borderColor: theme.line, borderRadius: 3, padding: 12 },
  open: { marginTop: 22, padding: 13, backgroundColor: theme.ink, borderRadius: 3, alignItems: 'center' },
  openT: { fontSize: 13.5, fontWeight: '700', color: theme.paper },
  del: { marginTop: 8, padding: 11, borderWidth: 1.3, borderColor: theme.line, borderRadius: 3, alignItems: 'center' },
  delT: { fontSize: 12, fontWeight: '700', color: theme.dim },
});
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit`
Expected: 에러 없음(이제 Detail import 해소됨).

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `cd /Users/jihyun/dev/link-moa/moa && npm test`
Expected: PASS (format 10 + platform 5 + filter 6 + smoke 1 = 22 tests).

- [ ] **Step 4: 실기기/시뮬레이터 통합 수동 검증**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx expo run:ios`

체크리스트(모두 통과해야 Task 완료):
- [ ] 첫 실행 시 시드 5개 항목이 "아직 안 봤어요" 탭에 보인다(옷 코디 1건은 이미 seen이라 안 보임 → 탭 카운트 4).
- [ ] "전체" 탭으로 바꾸면 5개 모두, 최신순(책 → … → 파스타)으로 보인다.
- [ ] 폴더 칩(자기계발/요리 레시피/…)을 누르면 해당 폴더만 필터되고, 칩의 개수 뱃지가 맞다. 🔔은 요리 레시피·팝업·장소에 뜬다.
- [ ] 검색창에 "웨이팅" 입력 → 성수 팝업만 남는다. 지우면 복귀.
- [ ] 항목을 탭 → 상세로 슬라이드 진입. 메모 있는 항목은 노란 메모 박스, 없는 항목은 "남긴 메모가 없어요".
- [ ] 상세에서 뒤로 → "아직 안 봤어요" 탭에서 방금 본 항목이 사라지고(본 것 처리), 탭 카운트가 1 줄어든다.
- [ ] "삭제" → Home 복귀, 목록에서 제거된다.
- [ ] "원본 열기" → Safari로 URL이 열린다(시드 URL은 더미라 404 가능 — 열리는 동작만 확인).
- [ ] 앱을 완전히 종료 후 재실행 → 본 것/삭제 상태가 유지된다(SQLite 영속).

- [ ] **Step 5: 커밋**

```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/screens/DetailScreen.tsx
git commit -m "feat(moa): detail screen — view, mark-seen, delete"
```

---

## Self-Review (완료됨)

**Spec coverage(프로토타입 대비):**
- 헤더 "링크모아 / 나중에 볼 것들" ✅ Task 5 · 탭 "아직 안 봤어요/전체" + 뱃지 ✅ Task 5 · 검색 ✅ Task 5 · 폴더 칩(색·개수·🔔) ✅ Task 5 · 목록 행(newdot·메모/본문·태그·플랫폼·날짜·썸네일 placeholder) ✅ Task 5 · 상세(hero·태그·제목·작성자·메모·본문·원본 열기·삭제) ✅ Task 6 · 상세 진입 시 본 것 처리 ✅ Task 6 · 빈 상태 ✅ Task 5/6 · SQLite 영속 ✅ Task 4.
- **의도적으로 이 플랜에서 제외(후속 Phase):** 저장 시트·"새 폴더"·메타데이터 추출·썸네일 이미지 로딩(Phase 2), 공유 익스텐션(Phase 3), FAB "폴더별 리마인드"·푸시 알림(Phase 4). 스키마엔 `remind/cycle/metadata_status/thumbnail_path`를 미리 넣어 후속 Phase가 마이그레이션 없이 붙는다.

**Placeholder scan:** 코드 스텝은 전부 실제 코드. "적절히 처리" 류 없음. ✅

**Type consistency:** `Tab`(filter.ts) → Tabs/HomeScreen 일관. `RootStackParamList`(App.tsx) → Home/Detail 동일 참조. db 함수 시그니처(getItem/markSeen/deleteItem/listFolders/listItems/resetToSeed)가 화면 사용처와 일치. ✅

---

## 다음 Phase 예고
- **Phase 2:** 앱 내 저장 시트(제목·폴더·메모·새 폴더) + URL 감지 + YouTube oEmbed / OG 태그 파싱 + 썸네일 로컬 저장 + 중복 URL 정규화.
- **Phase 3:** `expo-share-extension`으로 인스타·유튜브 공유 → App Group 인박스 → 메인 앱 수거.
- **Phase 4:** `expo-notifications` 폴더별 주기 리마인드 예약 + FAB 설정 시트(**주기는 드롭다운/피커로 선택** — 1·3·7·14·30일 등) + 탭→상세 딥링크.
```
