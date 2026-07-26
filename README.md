# 장소모아 (place-moa)

릴스·쇼츠·영상 속 장소를 **AI로 추출**해 지도에 모아두는 장소 특화 아카이버.
링크만 붙여넣으면 장소를 찾아 지도에 핀으로 꽂고, 방문 기록·"또간집" 평가·묶어 공유까지.

## 기능

- **AI 장소 추출** — 공유한 링크/캡션에서 Gemini(flash-lite)가 장소를 뽑음. 여러 곳이면 대기함에서 골라 저장
- **정확한 지오코딩** — Kakao 로컬 API로 도로명주소 + 좌표 (동명 지점은 지역으로 구분)
- **네이버 대표사진** — 장소 대표사진을 썸네일로 (best-effort, 실패 시 카테고리 이미지)
- **지도** — 카테고리별 색·모양 핀, 내 위치 근처 저장 장소 알림
- **목록/필터** — 카테고리·지역·안 가본 곳·⭐또간집
- **방문 기록** — 방문 횟수 + "또간집(또 갈래요)" / "한 번이면 충분"
- **묶어 공유** — 여러 장소를 하나의 링크로 묶어 공유 (`/s/[id]`), 받는 사람이 자기 지도에 담기
- **노트북 원클릭 저장** — 북마클릿(`/add`)으로 웹 인스타/유튜브에서 바로 저장

## 스택

Next.js 15 (App Router) · React 19 · libsql(SQLite) · Leaflet · 익명 쿠키 계정

## 로컬 실행

```bash
npm install
cp .env.example .env   # 키 입력
npm run dev            # http://localhost:3000
```

### 환경변수 (`.env`)

| 키 | 용도 | 없으면 |
|---|---|---|
| `GEMINI_API_KEY` | 장소 추출 | 데모 추출로 폴백 |
| `GEMINI_MODEL` | 기본 `gemini-flash-lite-latest` | |
| `KAKAO_REST_KEY` | 지오코딩(주소·좌표) | Nominatim 폴백(부정확) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | 프로덕션 영속 DB | 로컬은 파일, Vercel은 임시 |

## 참고

- `prototype/places.html` — 단일 HTML 설계 프로토타입 (기능·UX 검증용)
- `docs/` — 디자인 토큰 및 설계 문서
- 네이버 사진은 비공식 스크래핑 기반 — 상업 런칭 전 Google Places 등으로 교체 권장
