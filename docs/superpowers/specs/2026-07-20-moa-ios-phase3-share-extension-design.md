# 링크모아 iOS — Phase 3: 공유 익스텐션 설계

날짜: 2026-07-20
상태: 검토중
관계: Phase 1(브라우징)·Phase 2(앱 내 저장+메타데이터) 위에 얹음. Phase 2의 저장·메타데이터 로직을 재사용.

## 문제 / 목표

지금은 앱을 열고 "＋"로 링크를 붙여넣어야만 담을 수 있다. 진짜 필요한 건 **인스타·유튜브·사파리에서 공유 버튼 한 번으로 링크모아에 담기**다. 이게 이 앱의 핵심 수집 흐름이고, 사용자가 가장 원한 기능이다.

**목표:** iOS 공유 시트에 "링크모아"가 뜨고, 누르면 **공유 시트 안 화면**에서 (미리보기 없이) 메타데이터로 채워진 **수정 가능한 제목 + 폴더 선택(+새 폴더 생성) + 메모(선택)** 를 하고, **완료**를 누르면 제목·본문·작성자·메모·폴더·플랫폼까지 저장된다.

## 스파이크 결과 (검증 완료)

`expo-share-extension`(5.0.6)이 이 툴체인(Expo SDK 57 / RN 0.86 / Xcode 26.2)에서 **작동함을 실기기 컴파일로 확인**:
- config 플러그인이 익스텐션 타깃(`appShareExtension`)을 정상 생성 ✓
- Pods 설치 성공(CocoaPods UTF-8 locale 픽스 필요: `LANG=en_US.UTF-8`) ✓
- 유일한 빌드 블로커는 **익스텐션 타깃 iOS 배포 타깃(15.1) < Expo 코어 요구(16.4)** — 배포 타깃을 16.4로 올리면 해결되는 알려진 설정 문제(아이폰 15는 iOS 17+라 무관)

## 아키텍처

```
[인스타/유튜브/사파리]  → 공유 → "링크모아" 익스텐션 (RN UI, 공유 시트 안)
   1. 공유된 URL 수신 → 플랫폼 판별 → 메타데이터 추출(oEmbed/OG)
   2. UI: [수정 가능한 제목(메타로 채움)] [폴더 칩 + ＋새 폴더] [메모(선택)]
   3. 완료 → App Group 공유 SQLite DB에 직접 저장 → 익스텐션 닫힘
        │  (같은 DB 파일)
        ▼
   메인 앱: 같은 공유 DB를 읽음 → 저장된 항목이 이미 목록에 있음
     - 다음 실행/포그라운드 시: 썸네일 아직 없는 항목의 remote URL로
       로컬 다운로드·캐시(Phase 2 cacheThumbnail 재사용) → thumbnail_path 채움
```

**핵심 결정: App Group 공유 SQLite DB.**
익스텐션과 앱이 **App Group 컨테이너 안의 동일한 SQLite DB 파일**을 연다. 그래서 익스텐션이 완료 시 그 DB에 `addItem`/`addFolder` 하면, 앱은 같은 DB를 읽어 **별도 인박스·수거 단계 없이** 즉시 반영된다. 폴더 목록도 익스텐션이 이 공유 DB에서 읽는다.

**썸네일은 앱에서 다운로드.**
iOS 익스텐션은 메모리(~120MB)·시간 제한이 빡빡하므로, 익스텐션은 **원격 썸네일 URL만 DB에 기록**하고 실제 이미지 다운로드·로컬 캐시는 **메인 앱이 다음 실행 때** 처리한다(Phase 2 `cacheThumbnail` 재사용). 트레이드오프: 공유 직후엔 썸네일이 없고, 앱을 한 번 연 뒤 채워진다 (사용자 승인됨).

## 데이터 모델 변경 (마이그레이션 1건)

`items`에 컬럼 추가:
- `thumbnail_url TEXT` — 원격 썸네일 URL(익스텐션이 기록). 앱이 이걸로 다운로드해 `thumbnail_path`(로컬)를 채우면 역할 종료.

마이그레이션: `getDb()` 스키마 셋업에 `ALTER TABLE items ADD COLUMN thumbnail_url TEXT`(존재 확인 후). 기존 행은 NULL(영향 없음).

앱의 썸네일 보강 규칙(포그라운드): `thumbnail_path IS NULL AND thumbnail_url IS NOT NULL`인 항목에 대해 `cacheThumbnail(thumbnail_url, id)` → 성공 시 `updateItemMetadata(thumbnail_path)`.

## 익스텐션 화면 (RN)

- **미리보기 없음.**
- **제목** — 진입 즉시 메타데이터 추출을 시작, 완료되면 제목 필드를 채움(로딩 중엔 placeholder). 실패하면 도메인(hostnameOf)으로 폴백. **항상 수정 가능.**
- **폴더** — 공유 DB의 기존 폴더를 칩으로. 하나 선택(미선택 = 미분류). **＋새 폴더**: 이름 입력 → `addFolder`(공유 DB) → 즉시 선택.
- **메모(선택)** — 한 줄.
- **완료 버튼** — 공유 DB에 `addItem({url, platform, title, caption, author, thumbnail_url, memo, folder_id, metadata_status})` → `close()`로 시트 닫음. 제목만 있으면(또는 도메인 폴백) 저장 가능.
- **취소** — 저장 없이 닫음.

메타데이터 추출은 Phase 2의 `fetchMetadata`(oEmbed/OG, 네트워크)를 그대로 씀 — 네트워크 호출은 익스텐션에서도 가볍다. 썸네일 **다운로드**만 익스텐션에서 안 한다.

## 컴포넌트 / 파일 경계

- `src/lib/db.ts` — DB를 App Group 경로에서 열도록 수정(공유). `thumbnail_url` 컬럼·마이그레이션·`addItem`에 thumbnail_url 반영. 앱·익스텐션 공용.
- `src/lib/shareStore.ts`(신규) — App Group 컨테이너 경로 해석 + 공유 DB 경로 상수. (경로 해석에 소형 네이티브/모듈 필요할 수 있음 — Task 1에서 확정.)
- `src/lib/save.ts` — 앱 쪽 저장은 유지. 익스텐션은 fetchMetadata + db.addItem을 직접 조합(썸네일 다운로드 제외)한 경량 경로 사용.
- `ShareExtension.tsx` / `index.share.js` — 익스텐션 UI + 등록.
- `src/screens/HomeScreen.tsx` — 포그라운드 시 "썸네일 미보강 항목" 다운로드 패스 추가.
- `app.json` — plugins: expo-build-properties(ios.deploymentTarget 16.4), expo-share-extension(excludedPackages + activationRules: URL), App Group.
- `metro.config.js` — withShareExtension 래퍼(스파이크에서 이미 생성).

## 설정 (iOS)

- **App Group**: `group.com.jihyun.linkmoa` — 앱·익스텐션 양 타깃 entitlement. (expo-share-extension이 bundleId 기준 자동 구성; 확인 필요.)
- **배포 타깃 16.4** (expo-build-properties). 익스텐션 타깃도 16.4가 되도록 보장(스파이크에서 이게 관건이었음 — Task 1에서 확정).
- **excludedPackages**: 익스텐션이 안 쓰는 무거운 모듈 제외(`@expo/dom-webview` 등). 익스텐션은 expo-sqlite(공유 DB 읽기/쓰기) + 네트워크(fetch)만 필요.
- **activationRules**: URL/텍스트 공유 대상으로 설정(인스타·유튜브·사파리의 링크 공유를 받도록).

## 리스크 / 선(先)검증 (Task 1)

이 Phase의 유일한 큰 불확실성은 **App Group 공유 SQLite**다. Task 1에서 먼저 실기기로 못박는다:
1. 익스텐션 타깃 **그린 빌드**(배포 타깃 16.4 + 모듈 제외).
2. **App Group 컨테이너 경로 해석** — JS에서 `group.com.jihyun.linkmoa` 컨테이너 경로를 얻는 방법 확정(expo-file-system Paths API / 소형 네이티브 헬퍼 중 가능한 것).
3. expo-sqlite를 그 경로로 열어 **앱·익스텐션이 같은 DB를 읽고 씀**을 확인(익스텐션에서 쓴 행을 앱에서 읽기).

**폴백(위 3이 막히면):** App Group `UserDefaults(suiteName:)`에 인박스 JSON을 쓰고 앱이 수거하는 원래 MVP 방식으로 전환. 이때도 익스텐션 UI/UX는 동일. 이 폴백은 Task 1 결과를 보고 결정.

## 테스트 전략

- **단위(jest):** 익스텐션↔앱 공용 순수 로직은 이미 Phase 2에서 커버(url·metadata). 신규 순수 로직(예: 썸네일 보강 대상 선별 필터)이 있으면 TDD.
- **네이티브(DB/App Group/익스텐션):** jest 불가 → **실기기 수동 체크리스트**. 인스타 릴스·유튜브 쇼츠·사파리 링크 공유 → 익스텐션에서 제목 자동채움·수정·폴더선택·새폴더·메모·완료 → 앱 열어 항목·본문·메모 확인 → 잠시 뒤 썸네일 채워짐 → 앱 재실행 유지.

## 결정 기록

| 결정 | 선택 | 이유 |
|---|---|---|
| 익스텐션 도구 | expo-share-extension | 스파이크로 SDK 57 작동 확인; 공유 시트 안 RN 풀 UI 가능 |
| 데이터 공유 | App Group 공유 SQLite DB | 인박스·수거 없이 즉시 반영, 폴더도 공유 |
| 미리보기 | 없음 | 사용자 결정 |
| 제목 | 메타데이터로 채우고 수정 가능 | 사용자 결정 |
| 새 폴더 | 익스텐션에서도 생성 | 사용자 결정 (공유 DB라 자연스럽게 가능) |
| 썸네일 | 익스텐션은 URL만, 앱이 다운로드 | 익스텐션 메모리 제한 |
| 배포 타깃 | 16.4 | Expo 코어 요구; iPhone 15은 iOS 17+ |
| 이미지(갤러리) 공유 | 이번 Phase 제외 | YAGNI, 링크에 집중 |
