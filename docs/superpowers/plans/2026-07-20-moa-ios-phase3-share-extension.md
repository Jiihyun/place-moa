# 링크모아 iOS — Phase 3: 공유 익스텐션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iOS 공유 시트에서 "링크모아"로 링크를 담을 수 있게 한다 — 공유 시트 안 화면에서 메타데이터로 채워진 수정 가능한 제목 + 폴더 선택(+새 폴더) + 메모를 하고, 완료하면 App Group 공유 SQLite DB에 저장돼 앱에 즉시 반영된다.

**Architecture:** `expo-share-extension`(RN UI를 공유 시트에 렌더)로 익스텐션 타깃을 만든다. 앱과 익스텐션은 **App Group 컨테이너 안의 동일한 SQLite DB**를 연다(별도 인박스 없음). 익스텐션은 메타데이터를 네트워크로 추출하되 썸네일 이미지는 다운로드하지 않고 원격 URL만 저장하며, 메인 앱이 포그라운드에서 로컬 캐시한다.

**Tech Stack:** Phase 1·2 스택 + `expo-share-extension`(5.0.6), `expo-build-properties`(배포 타깃 16.4), expo-file-system `Paths.appleSharedContainers`(App Group 경로), expo-sqlite `directory` 옵션(공유 DB 경로).

## Global Constraints

- **Phase 1·2의 Global Constraints를 모두 상속** (로컬 전용, iOS 우선, 앱스토어 미배포, UUID PK + updated_at, "모아" 프로토타입 UI 기준, 테마 색, PAL, 앱 이름 "링크모아", 앱 디렉터리 `moa/`, 저장 항상 성공).
- **App Group ID: `group.com.jihyun.linkmoa`** (bundleIdentifier `com.jihyun.linkmoa` 기준). 앱·익스텐션 양 타깃 entitlement.
- **iOS 배포 타깃 16.4** (expo-build-properties + 익스텐션 타깃도 16.4). Expo 코어가 16.4 요구, iPhone 15은 iOS 17+.
- **익스텐션은 최소로.** 메타데이터 네트워크 추출은 하되(가벼움), **썸네일 이미지 다운로드·로컬 캐시는 안 함**(원격 URL만 DB 기록). 앱이 나중에 다운로드.
- **excludedPackages로 익스텐션 경량화** — 최소 `@expo/dom-webview` 제외. 익스텐션이 실제로 쓰는 것: expo-sqlite(공유 DB), 네트워크(fetch).
- **데이터 공유는 App Group 공유 SQLite DB.** 인박스·수거 단계 없음. (Task 1에서 실기기 검증 실패 시 스펙의 인박스 폴백으로 전환 — 그 경우 이 플랜을 개정.)
- **스키마 변경 1건:** `items.thumbnail_url TEXT`(원격 썸네일 URL). `getDb`에서 idempotent 마이그레이션.
- **CocoaPods는 UTF-8 locale로:** 모든 `pod install`은 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.
- **expo-modules-jsi 패치(abs→magnitude)는 patch-package로 유지**(Phase 1에서 커밋됨). npm 설치 후 postinstall이 재적용.
- **푸시 금지, 커밋만.**

---

## 현재 상태 (스파이크 산출물, 미커밋)

브레인스토밍 스파이크에서 이미 워킹트리에 있음(Task 1이 이걸 정식화·검증·커밋):
- `moa/package.json`: `expo-share-extension`, `expo-build-properties` 추가됨
- `moa/app.json` plugins: `["expo-build-properties",{ios:{deploymentTarget:"16.4"}}]`, `expo-sqlite`, `["expo-share-extension",{excludedPackages:["@expo/dom-webview"]}]`
- `moa/metro.config.js`(withShareExtension), `moa/index.share.js`, `moa/ShareExtension.tsx`(최소 UI)
- `ios/`는 prebuild로 재생성됨(appShareExtension 타깃 존재), 단 **아직 그린 빌드 아님**(익스텐션 배포 타깃 15.1 → 16.4 필요)

---

## File Structure (Phase 3)

```
moa/
  app.json                       # plugins: build-properties(16.4), share-extension(excluded, activationRules)
  metro.config.js                # withShareExtension (기존)
  index.share.js                 # 익스텐션 진입점 (기존, 유지)
  ShareExtension.tsx             # 익스텐션 UI (재작성: 제목·폴더·새폴더·메모·완료)
  src/lib/
    appGroup.ts                  # (신규) App Group DB 디렉터리 경로 해석
    db.ts                        # (수정) 공유 경로에서 open + thumbnail_url 컬럼/마이그레이션 + addItem 반영
    shareSave.ts                 # (신규) 익스텐션 저장: fetchMetadata + addItem(썸네일 URL만)
    thumbnailSync.ts             # (신규) 앱 포그라운드: thumbnail_url→로컬 캐시 보강 (순수 선별 로직 TDD)
  src/lib/__tests__/
    thumbnailSync.test.ts        # 보강 대상 선별 순수 로직
  src/screens/HomeScreen.tsx     # (수정) 포그라운드 시 thumbnailSync 실행
```

---

## Task 1: App Group 공유 DB + 익스텐션 그린 빌드 (선검증 스파이크) 🔬

**목표:** 앱·익스텐션이 App Group 컨테이너의 **같은 SQLite DB**를 열 수 있고, **익스텐션이 실기기에 빌드·설치·실행**됨을 확정한다. 이 Task가 Phase 3 전체의 전제.

**Files:**
- Create: `moa/src/lib/appGroup.ts`
- Modify: `moa/app.json`(App Group + activationRules 확인), 이미 있는 스파이크 파일 정식화

**Interfaces:**
- Produces: `getSharedDbDirectory(): string | null` (appGroup.ts) — App Group 컨테이너의 DB 디렉터리 절대 경로(`file://...`), 불가 시 null

- [ ] **Step 1: App Group 경로 해석 방법 확정 (조사)**

expo-file-system(SDK 57 신규 API)의 `Paths.appleSharedContainers`를 확인한다:
```bash
cd /Users/jihyun/dev/link-moa/moa
node -e "const fs=require('./node_modules/expo-file-system'); console.log(Object.keys(fs), Object.keys(fs.Paths||{}))" 2>&1 | tail -5
grep -rn "appleSharedContainers" node_modules/expo-file-system/build 2>/dev/null | head
```
Expected: `Paths.appleSharedContainers`(App Group ID→Directory 레코드)가 존재. 존재하면 그것으로 경로 해석. **없으면** 이 Task를 BLOCKED로 보고 → 컨트롤러가 소형 네이티브 헬퍼 or 스펙의 인박스 폴백을 결정.

- [ ] **Step 2: appGroup.ts 구현**

Create `moa/src/lib/appGroup.ts`:
```ts
import { Paths } from 'expo-file-system';

export const APP_GROUP_ID = 'group.com.jihyun.linkmoa';

// App Group 공유 컨테이너 안, DB를 둘 디렉터리의 절대 경로(file://...).
// 앱·익스텐션 양쪽이 이 경로의 같은 moa.db 파일을 연다.
export function getSharedDbDirectory(): string | null {
  try {
    const container = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!container) return null;
    return container.uri;
  } catch {
    return null;
  }
}
```
(Step 1에서 API 형태가 다르면 그에 맞춰 조정하되, 시그니처 `getSharedDbDirectory(): string | null`는 유지.)

- [ ] **Step 3: app.json — App Group entitlement + activationRules 확인**

`moa/app.json`의 share-extension 플러그인 설정을 아래로(활성화 규칙 = URL/텍스트 공유 수신, App Group는 플러그인이 bundleId 기준 자동 구성):
```json
[
  "expo-share-extension",
  {
    "excludedPackages": ["@expo/dom-webview"],
    "activationRules": [
      { "type": "url", "max": 1 },
      { "type": "text", "max": 1 }
    ]
  }
]
```
그리고 `ios.entitlements`에 App Group이 들어가는지 prebuild 후 확인(자동 구성 안 되면 `ios.entitlements`에 `"com.apple.security.application-groups": ["group.com.jihyun.linkmoa"]` 추가).

- [ ] **Step 4: prebuild + pod install + 익스텐션 그린 빌드**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa
CI=1 npx expo prebuild --platform ios --clean
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 xcodebuild build -workspace app.xcworkspace -scheme app \
  -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO 2>&1 | \
  grep -aE "error: |BUILD SUCCEEDED|BUILD FAILED" | tail
```
Expected: `** BUILD SUCCEEDED **`. 만약 `appShareExtension`이 여전히 iOS 15.1로 컴파일되며 "minimum deployment target of iOS 16.4" 에러가 나면 → **익스텐션 타깃 배포 타깃을 16.4로 강제**한다:
- expo-build-properties가 익스텐션 타깃에 안 먹으므로, `app.json`에 소형 커스텀 인라인 플러그인 또는 Podfile post_install로 모든 타깃 `IPHONEOS_DEPLOYMENT_TARGET=16.4` 설정. 가장 간단한 방법: `expo-build-properties`의 `ios.deploymentTarget`을 유지하되, 익스텐션 타깃까지 커버되도록 `ios/Podfile`의 post_install에 다음을 추가하는 config plugin(`withDangerousMod`/`withPodfile`)을 `plugins`에 넣는다:
```ruby
installer.pods_project.targets.each do |t|
  t.build_configurations.each do |c|
    c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
  end
end
installer.generated_projects.each do |proj|
  proj.targets.each do |t|
    t.build_configurations.each do |c|
      c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
    end
  end
end
```
반복해서 `BUILD SUCCEEDED`가 나올 때까지 배포 타깃/제외 모듈을 조정. (이게 이 Task의 핵심 난이도.)

- [ ] **Step 5: tsc + 커밋**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit` → clean.
```bash
cd /Users/jihyun/dev/link-moa
git add moa/app.json moa/package.json moa/package-lock.json moa/metro.config.js moa/index.share.js moa/ShareExtension.tsx moa/src/lib/appGroup.ts
git commit -m "feat(moa): share extension scaffold — App Group path + green build (deploy target 16.4)"
```

- [ ] **Step 6: 실기기 검증 (사용자 폰) — App Group 공유 확인**

> 이 단계는 컨트롤러가 사용자에게 요청. Xcode에서 iPhone 15로 Run → 인스타/사파리에서 링크 공유 → 공유 시트에 "링크모아" 뜨는지 + 최소 UI(현재 스파이크 UI) 열리는지 확인. (완전한 공유 저장은 Task 4 이후.) 여기서 익스텐션이 뜨기만 하면 구조 검증 성공.

---

## Task 2: DB를 공유 경로에서 열기 + thumbnail_url 컬럼/마이그레이션

**Files:**
- Modify: `moa/src/lib/db.ts`

**Interfaces:**
- Consumes: `getSharedDbDirectory` (appGroup.ts)
- Produces: `db.ts`가 공유 경로에서 DB를 염(불가 시 기존 로컬 경로 폴백). `items.thumbnail_url` 지원. `addItem` 입력에 `thumbnail_url?` 추가. `MetaPatch`에 `thumbnail_url?` 추가. `listItemsNeedingThumbnail(): Promise<Item[]>` 추가.

- [ ] **Step 1: getDb를 공유 경로 + 마이그레이션으로 수정**

`moa/src/lib/db.ts`의 `getDb` 내부, `openDatabaseAsync` 호출을 공유 디렉터리 사용으로 바꾸고, 스키마 셋업 뒤 컬럼 마이그레이션을 추가한다. `openDatabaseAsync`의 3번째 인자 `directory`로 공유 경로를 넘긴다(없으면 기본 경로):
```ts
import { getSharedDbDirectory } from './appGroup';
// ...
_dbPromise = (async () => {
  const dir = getSharedDbDirectory();
  const db = dir
    ? await SQLite.openDatabaseAsync('moa.db', undefined, dir)
    : await SQLite.openDatabaseAsync('moa.db');
  await db.execAsync(SCHEMA);
  await migrate(db);
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM folders');
  if (!row || row.c === 0) await seed(db);
  return db;
})().catch((e) => { _dbPromise = null; throw e; });
```
그리고 `Item` 타입에 `thumbnail_url: string | null` 추가(`moa/src/types.ts`), SCHEMA의 items에 `thumbnail_url TEXT` 추가(신규 설치용), 그리고 기존 DB용 마이그레이션:
```ts
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(items)");
  if (!cols.some((c) => c.name === 'thumbnail_url')) {
    await db.execAsync('ALTER TABLE items ADD COLUMN thumbnail_url TEXT');
  }
}
```

- [ ] **Step 2: addItem/MetaPatch에 thumbnail_url 반영 + 신규 쿼리**

`NewItemInput`에 `thumbnail_url?: string | null;` 추가. `addItem`의 INSERT 컬럼/값에 `thumbnail_url` 포함(값 `input.thumbnail_url ?? null`). `MetaPatch`에 `thumbnail_url?: string | null;` 추가하고 `updateItemMetadata`의 `set('thumbnail_url', patch.thumbnail_url)` 추가. 신규:
```ts
export async function listItemsNeedingThumbnail(): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>(
    'SELECT * FROM items WHERE thumbnail_path IS NULL AND thumbnail_url IS NOT NULL',
  );
}
```
(items SELECT는 `SELECT *`라 새 컬럼 자동 포함. `Item` 타입에 thumbnail_url 있으니 타입 일치.)

- [ ] **Step 3: 타입체크 + 커밋**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit` → clean. (native DB라 jest 없음; 런타임은 Task 6 실기기.)
```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/db.ts moa/src/types.ts
git commit -m "feat(moa): shared-container db open + thumbnail_url column/migration"
```

---

## Task 3: 익스텐션 저장 로직 (shareSave.ts)

**Files:**
- Create: `moa/src/lib/shareSave.ts`

**Interfaces:**
- Consumes: `detectPlatform`(platform.ts), `fetchMetadata`(metadata.ts), `hostnameOf`(url.ts), `addItem`(db.ts)
- Produces:
  - `prefetchTitle(url: string): Promise<{ title: string; platform: string; caption: string | null; author: string | null; thumbnailUrl: string | null; status: 'done'|'failed' }>` — 익스텐션이 진입 시 호출해 제목 등을 미리 채움. 제목은 meta.title ?? hostnameOf(url) ?? ''.
  - `saveFromExtension(input: { url: string; title: string; memo: string; folderId: string | null; meta: Awaited<ReturnType<typeof prefetchTitle>> }): Promise<string>` — 공유 DB에 addItem(썸네일은 URL만, metadata_status = meta.status). 반환 id.

- [ ] **Step 1: 구현**

Create `moa/src/lib/shareSave.ts`:
```ts
import { detectPlatform } from './platform';
import { fetchMetadata } from './metadata';
import { hostnameOf } from './url';
import { addItem } from './db';

export type PrefetchedMeta = {
  title: string;
  platform: string;
  caption: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  status: 'done' | 'failed';
};

export async function prefetchTitle(url: string): Promise<PrefetchedMeta> {
  const meta = await fetchMetadata(url);
  const platform = meta.platform ?? detectPlatform(url) ?? '기타';
  return {
    title: meta.title ?? hostnameOf(url) ?? '',
    platform,
    caption: meta.description ?? null,
    author: meta.author ?? null,
    thumbnailUrl: meta.thumbnailUrl ?? null,
    status: meta.status,
  };
}

export async function saveFromExtension(input: {
  url: string;
  title: string;
  memo: string;
  folderId: string | null;
  meta: PrefetchedMeta;
}): Promise<string> {
  const title = input.title.trim() || hostnameOf(input.url) || '제목 없는 링크';
  return addItem({
    url: input.url.trim(),
    platform: input.meta.platform,
    title,
    caption: input.meta.caption,
    author: input.meta.author,
    memo: input.memo.trim() || null,
    thumbnail_url: input.meta.thumbnailUrl,
    folder_id: input.folderId,
    metadata_status: input.meta.status,
  });
}
```

- [ ] **Step 2: 타입체크 + 커밋**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit` → clean.
```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/shareSave.ts
git commit -m "feat(moa): share-extension save logic (prefetch title + save to shared db)"
```

---

## Task 4: 익스텐션 UI (ShareExtension.tsx)

**Files:**
- Modify: `moa/ShareExtension.tsx` (스파이크 최소 UI를 실물로 교체)

**Interfaces:**
- Consumes: `close`(expo-share-extension), `prefetchTitle`/`saveFromExtension`(shareSave.ts), `listFolders`/`addFolder`(db.ts), `theme`(src/theme), `Folder`(types)
- Produces: 익스텐션 화면. props로 `{ url }`(expo-share-extension이 공유된 URL 전달).

- [ ] **Step 1: ShareExtension 구현**

Replace `moa/ShareExtension.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { close } from 'expo-share-extension';
import { theme } from './src/theme';
import type { Folder } from './src/types';
import { listFolders, addFolder } from './src/lib/db';
import { prefetchTitle, saveFromExtension, type PrefetchedMeta } from './src/lib/shareSave';

export default function ShareExtension({ url }: { url: string }) {
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [meta, setMeta] = useState<PrefetchedMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const fs = await listFolders().catch(() => []);
      setFolders(fs);
      const m = await prefetchTitle(url);
      setMeta(m);
      setTitle(m.title);
      setLoading(false);
    })();
  }, [url]);

  async function onCreateFolder() {
    const name = newFolder.trim();
    if (!name || folders.some((f) => f.name === name)) return;
    const f = await addFolder(name);
    setFolders((prev) => [...prev, f]);
    setFolderId(f.id);
    setNewFolder('');
  }

  async function onDone() {
    if (busy || !meta) return;
    setBusy(true);
    try {
      await saveFromExtension({ url, title, memo, folderId, meta });
      close();
    } catch {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        <Pressable onPress={close}><Text style={s.cancel}>취소</Text></Pressable>
        <Text style={s.h}>링크모아에 담기</Text>
        <Pressable onPress={onDone} disabled={busy || loading}>
          <Text style={[s.done, (busy || loading) && s.dim]}>{busy ? '저장 중…' : '완료'}</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
        <Text style={s.lab}>제목</Text>
        {loading ? (
          <View style={s.loadingRow}><ActivityIndicator /><Text style={s.loadingT}>메타데이터 불러오는 중…</Text></View>
        ) : (
          <TextInput style={s.inp} value={title} onChangeText={setTitle} placeholder="제목" placeholderTextColor="#A99C89" />
        )}
        <Text style={s.lab}>폴더</Text>
        <View style={s.chips}>
          {folders.map((f) => (
            <Pressable key={f.id} style={[s.chip, folderId === f.id && s.chipOn]} onPress={() => setFolderId(f.id)}>
              <View style={[s.dot, { backgroundColor: f.color }]} />
              <Text style={[s.chipT, folderId === f.id && s.chipTOn]}>{f.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.newRow}>
          <TextInput style={[s.inp, { flex: 1 }]} value={newFolder} onChangeText={setNewFolder}
                     placeholder="새 폴더 이름" placeholderTextColor="#A99C89" onSubmitEditing={onCreateFolder} />
          <Pressable style={s.newBtn} onPress={onCreateFolder}><Text style={s.newBtnT}>＋ 만들기</Text></Pressable>
        </View>
        <Text style={s.lab}>메모 (선택)</Text>
        <TextInput style={[s.inp, { height: 56, textAlignVertical: 'top' }]} value={memo} onChangeText={setMemo}
                   multiline placeholder="왜 저장했는지 한 줄" placeholderTextColor="#A99C89" />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.paper },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.line },
  cancel: { fontSize: 14, color: theme.dim, fontWeight: '600' },
  h: { fontSize: 14, fontWeight: '800', color: theme.ink },
  done: { fontSize: 14, color: theme.hi, fontWeight: '800' },
  dim: { opacity: 0.4 },
  lab: { fontSize: 10, fontWeight: '800', color: theme.dim, letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  inp: { borderWidth: 1.4, borderColor: theme.ink, borderRadius: 3, backgroundColor: '#fff',
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: theme.ink },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  loadingT: { color: theme.dim, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1.4, borderColor: theme.line, borderRadius: 99, backgroundColor: '#fff' },
  chipOn: { borderColor: theme.ink },
  dot: { width: 6, height: 6, borderRadius: 99 },
  chipT: { fontSize: 11.5, fontWeight: '600', color: theme.dim },
  chipTOn: { color: theme.ink, fontWeight: '800' },
  newRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  newBtn: { paddingHorizontal: 13, justifyContent: 'center', backgroundColor: theme.ink, borderRadius: 3 },
  newBtnT: { color: theme.paper, fontSize: 11.5, fontWeight: '700' },
});
```

- [ ] **Step 2: 타입체크 + 커밋**

Run: `cd /Users/jihyun/dev/link-moa/moa && npx tsc --noEmit` → clean.
```bash
cd /Users/jihyun/dev/link-moa
git add moa/ShareExtension.tsx
git commit -m "feat(moa): share extension UI — editable title, folders + new folder, memo, done"
```

---

## Task 5: 앱 포그라운드 썸네일 보강 (thumbnailSync)

**Files:**
- Create: `moa/src/lib/thumbnailSync.ts`, `moa/src/lib/__tests__/thumbnailSync.test.ts`
- Modify: `moa/src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `listItemsNeedingThumbnail`/`updateItemMetadata`(db.ts), `cacheThumbnail`(thumbnail.ts), `Item`(types)
- Produces:
  - `needsThumbnail(item: Item): boolean` (순수, TDD) — `thumbnail_path == null && !!thumbnail_url`
  - `syncThumbnails(): Promise<number>` — 보강 대상마다 cacheThumbnail → updateItemMetadata(thumbnail_path). 채운 개수 반환. 예외 삼킴.

- [ ] **Step 1: 실패 테스트**

Create `moa/src/lib/__tests__/thumbnailSync.test.ts`:
```ts
import { needsThumbnail } from '../thumbnailSync';
import type { Item } from '../../types';

function it_(over: Partial<Item>): Item {
  return { id: 'x', type: 'link', url: null, platform: '기타', title: '', caption: null,
    author: null, memo: null, thumbnail_path: null, thumbnail_url: null, folder_id: null,
    seen_at: null, metadata_status: 'done', created_at: 0, updated_at: 0, ...over };
}
test('url 있고 로컬 없으면 보강 대상', () =>
  expect(needsThumbnail(it_({ thumbnail_url: 'https://x/t.jpg', thumbnail_path: null }))).toBe(true));
test('로컬 이미 있으면 아님', () =>
  expect(needsThumbnail(it_({ thumbnail_url: 'https://x/t.jpg', thumbnail_path: 'file://a' }))).toBe(false));
test('url 없으면 아님', () =>
  expect(needsThumbnail(it_({ thumbnail_url: null }))).toBe(false));
```

- [ ] **Step 2: 실패 확인** — `cd /Users/jihyun/dev/link-moa/moa && npx jest thumbnailSync` → FAIL(모듈 없음).

- [ ] **Step 3: 구현**

Create `moa/src/lib/thumbnailSync.ts`:
```ts
import type { Item } from '../types';
import { listItemsNeedingThumbnail, updateItemMetadata } from './db';
import { cacheThumbnail } from './thumbnail';

export function needsThumbnail(item: Item): boolean {
  return item.thumbnail_path == null && !!item.thumbnail_url;
}

export async function syncThumbnails(): Promise<number> {
  let filled = 0;
  try {
    const items = await listItemsNeedingThumbnail();
    for (const it of items) {
      if (!it.thumbnail_url) continue;
      const path = await cacheThumbnail(it.thumbnail_url, it.id);
      if (path) { await updateItemMetadata(it.id, { thumbnail_path: path }); filled++; }
    }
  } catch {
    /* 보강 실패는 무시 — 다음 포그라운드에 재시도 */
  }
  return filled;
}
```

- [ ] **Step 4: 통과 확인** — `npx jest thumbnailSync` → PASS(3).

- [ ] **Step 5: HomeScreen 포그라운드 훅**

`moa/src/screens/HomeScreen.tsx`의 `reload` useCallback 근처에, 포커스 시 썸네일 보강 후 재로드:
```tsx
import { syncThumbnails } from '../lib/thumbnailSync';
// reload 정의 뒤:
useEffect(() => {
  let active = true;
  syncThumbnails().then((n) => { if (active && n > 0) reload(); });
  return () => { active = false; };
}, [reload]);
```
(`useEffect`는 이미 import됨.)

- [ ] **Step 6: 전체 테스트 + 타입체크 + 커밋**

Run: `cd /Users/jihyun/dev/link-moa/moa && npm test && npx tsc --noEmit`
Expected: jest 49개(46 + thumbnailSync 3), tsc clean.
```bash
cd /Users/jihyun/dev/link-moa
git add moa/src/lib/thumbnailSync.ts moa/src/lib/__tests__/thumbnailSync.test.ts moa/src/screens/HomeScreen.tsx
git commit -m "feat(moa): app foreground thumbnail sync from shared-db remote urls"
```

---

## Task 6: 통합 빌드 + 실기기 검증 체크리스트

**Files:** 없음(빌드·검증만)

- [ ] **Step 1: 빌드 확인 (서명 없이 컴파일)**

Run:
```bash
cd /Users/jihyun/dev/link-moa/moa/ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 xcodebuild build -workspace app.xcworkspace -scheme app \
  -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO 2>&1 | \
  grep -aE "error: |BUILD SUCCEEDED|BUILD FAILED" | tail
```
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 2: 실기기 수동 검증 (사용자 iPhone 15)**

> 컨트롤러가 사용자에게: Xcode Run으로 새 빌드 설치 후 —
- [ ] 인스타 릴스 "공유 → 링크모아" → 익스텐션 화면이 뜸
- [ ] 제목이 메타데이터로 자동 채워짐(잠시 로딩 후), 수정 가능
- [ ] 기존 폴더 칩 보이고 선택됨 / "＋만들기"로 새 폴더 생성·선택됨
- [ ] 메모 입력 후 "완료" → 익스텐션 닫힘
- [ ] 링크모아 앱 열면 방금 담은 항목이 목록에 있음(제목·본문·메모·폴더 반영)
- [ ] 잠시 뒤(또는 앱 재포커스) 썸네일이 채워짐
- [ ] 유튜브 쇼츠·사파리 링크도 동일하게 동작
- [ ] 앱에서 만든 폴더가 다음 공유 시 익스텐션 칩에 보임(공유 DB 확인)

---

## Self-Review (완료됨)

**Spec coverage:** 공유 시트 익스텐션 UI(제목 수정·폴더·새폴더·메모·완료) ✅ Task 4 · 메타데이터 추출 ✅ Task 3(prefetchTitle) · App Group 공유 SQLite ✅ Task 1·2 · thumbnail_url 컬럼/마이그레이션 ✅ Task 2 · 앱 썸네일 보강 ✅ Task 5 · 배포타깃 16.4/그린빌드 ✅ Task 1 · activationRules/App Group ✅ Task 1. 이미지 공유는 스펙대로 제외.

**Placeholder scan:** Task 1은 본질적으로 선검증 스파이크라 조정 여지를 명시(그린 빌드까지 반복). 나머지는 완전한 코드. "적절히 처리" 류 없음.

**Type consistency:** `Item`에 `thumbnail_url` 추가(Task 2) → thumbnailSync 테스트 fixture·db 쿼리·shareSave 일치. `NewItemInput.thumbnail_url`(Task 2) ↔ shareSave.addItem(Task 3). `PrefetchedMeta`(Task 3) ↔ ShareExtension(Task 4). `getSharedDbDirectory`(Task 1) ↔ db.ts(Task 2). `needsThumbnail`/`syncThumbnails`(Task 5) 일치.

**주의(Task 1 의존):** App Group 공유 SQLite가 실기기에서 실패하면 스펙의 인박스 폴백으로 전환 — 그 경우 Task 2~3을 개정(익스텐션은 App Group UserDefaults 인박스에 JSON 기록, 앱이 수거). Task 1 Step 6 결과로 결정.

## 다음
- Phase 4: expo-notifications 폴더별 주기 리마인드(주기 드롭다운) + 항목별 개별 알림.
