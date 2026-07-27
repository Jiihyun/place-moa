import { createClient, type Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';

let _db: Client | null = null;
let _ready: Promise<void> | null = null;

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  if (process.env.VERCEL) {
    // Vercel 서버리스: 영속 디스크 없음 — TURSO 미설정 시 임시(/tmp) DB로 동작 (데이터 휘발)
    return createClient({ url: 'file:/tmp/moa.db' });
  }
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return createClient({ url: `file:${path.join(dir, 'moa.db')}` });
}

export async function db(): Promise<Client> {
  if (!_db) _db = makeClient();
  if (!_ready) {
    const client = _db;
    _ready = (async () => {
    await client.batch([
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL, name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#8a8a86', emoji TEXT NOT NULL DEFAULT '📍')`,
      `CREATE TABLE IF NOT EXISTS places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL, title TEXT NOT NULL, cat_id INTEGER,
        region TEXT NOT NULL DEFAULT '미확인', address TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
        photo TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'other', source_url TEXT,
        memo TEXT NOT NULL DEFAULT '', visits INTEGER NOT NULL DEFAULT 0, verdict TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS pendings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL, video_title TEXT NOT NULL, source TEXT NOT NULL,
        source_url TEXT, candidates TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS bundles (
        id TEXT PRIMARY KEY, uid TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', sender TEXT NOT NULL DEFAULT '',
        place_ids TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL DEFAULT 'anon', name TEXT NOT NULL,
        props TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL, uid TEXT NOT NULL DEFAULT 'anon',
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE INDEX IF NOT EXISTS idx_places_uid ON places(uid)`,
      `CREATE INDEX IF NOT EXISTS idx_pendings_uid ON pendings(uid)`,
      `CREATE INDEX IF NOT EXISTS idx_events_name ON events(name)`,
    ], 'write');
    // 기존 DB 마이그레이션: address 컬럼 추가 (이미 있으면 무시)
    try { await client.execute("ALTER TABLE places ADD COLUMN address TEXT NOT NULL DEFAULT ''"); } catch {}
    try { await client.execute("ALTER TABLE places ADD COLUMN photo TEXT NOT NULL DEFAULT ''"); } catch {}
    // 검증용 waitlist 마이그레이션: 플랫폼·유형·닉네임 컬럼
    try { await client.execute("ALTER TABLE waitlist ADD COLUMN platform TEXT NOT NULL DEFAULT 'unknown'"); } catch {}
    try { await client.execute("ALTER TABLE waitlist ADD COLUMN persona TEXT NOT NULL DEFAULT ''"); } catch {}
    try { await client.execute("ALTER TABLE waitlist ADD COLUMN nickname TEXT NOT NULL DEFAULT ''"); } catch {}
    })();
  }
  await _ready;
  return _db;
}

export const DEFAULT_CATS = [
  { name: '맛집', color: '#e0483d', emoji: '🍽' },
  { name: '카페', color: '#9a6b3f', emoji: '☕' },
  { name: '술집·바', color: '#2f4b7c', emoji: '🍺' },
  { name: '기타', color: '#8a8a86', emoji: '📍' },
];

// 최초 생성이면 true 반환 (신규 유저 판별용 — 데모 장소 시드에 사용)
export async function ensureCats(uid: string): Promise<boolean> {
  const d = await db();
  const n = await d.execute({ sql: 'SELECT COUNT(*) c FROM categories WHERE uid=?', args: [uid] });
  if (Number(n.rows[0].c) === 0) {
    for (const c of DEFAULT_CATS) {
      await d.execute({ sql: 'INSERT INTO categories (uid,name,color,emoji) VALUES (?,?,?,?)', args: [uid, c.name, c.color, c.emoji] });
    }
    return true;
  }
  return false;
}

// 신규 유저 온보딩용 데모 장소 (강남 3곳) — 빈 지도 대신 채워진 첫인상.
// 좌표=Kakao, 사진=네이버 대표사진(pstatic, /api/img 프록시로 렌더). 실제 지점명이라 리뷰·지도 링크도 정확.
export const DEMO_PLACES = [
  { title: '미미옥 강남신논현점', category: '맛집', region: '서울 강남구', address: '서울 강남구 봉은사로4길 24', lat: 37.5032855, lng: 127.0264392, memo: '들기름 막국수·수육',
    photo: 'https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=https%3A%2F%2Fldb-phinf.pstatic.net%2F20240523_62%2F1716447442674lRemy_JPEG%2F%25B9%25CC%25B9%25CC%25BF%25C1_%25B0%25AD%25B3%25B2_%25BD%25C5%25B3%25ED%25C7%25F6%25C1%25A1_01.jpg' },
  { title: '런던베이글뮤지엄 도산점', category: '카페', region: '서울 강남구', address: '서울 강남구 언주로168길 33', lat: 37.5260683, lng: 127.0364388, memo: '베이글·크림치즈 · 오픈런',
    photo: 'https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=https%3A%2F%2Fldb-phinf.pstatic.net%2F20240619_136%2F1718755889599smMbU_JPEG%2FKakaoTalk_Photo_2024-06-19-09-10-18_002.jpeg' },
  { title: '르챔버', category: '술집·바', region: '서울 강남구', address: '서울 강남구 도산대로55길 42', lat: 37.5262560, lng: 127.0411281, memo: '위스키·클래식 칵테일 바',
    photo: 'https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=https%3A%2F%2Fldb-phinf.pstatic.net%2F20210329_76%2F1617013862048wy7MB_PNG%2F9.PNG' },
];

// 데모 장소 시드 — 장소가 하나도 없을 때만 (기존/삭제 유저 재시드 방지)
export async function seedDemoPlaces(uid: string) {
  const d = await db();
  const existing = await d.execute({ sql: 'SELECT COUNT(*) c FROM places WHERE uid=?', args: [uid] });
  if (Number(existing.rows[0].c) > 0) return;
  for (const p of DEMO_PLACES) {
    const cat_id = await catIdByName(uid, p.category);
    await d.execute({
      sql: 'INSERT INTO places (uid,title,cat_id,region,address,photo,lat,lng,source,source_url,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: [uid, p.title, cat_id, p.region, p.address, p.photo, p.lat, p.lng, 'demo', null, p.memo],
    });
  }
}

export async function catIdByName(uid: string, name: string): Promise<number | null> {
  const d = await db();
  await ensureCats(uid);
  const r = await d.execute({ sql: 'SELECT id FROM categories WHERE uid=? AND name=?', args: [uid, name] });
  if (r.rows.length) return Number(r.rows[0].id);
  const etc = await d.execute({ sql: 'SELECT id FROM categories WHERE uid=? ORDER BY id LIMIT 1', args: [uid] });
  return etc.rows.length ? Number(etc.rows[0].id) : null;
}

export function rowsOf(r: { rows: any[] }): any[] {
  return r.rows.map(row => ({ ...row }));
}

// 검증용 이벤트 로깅 (fire-and-forget — 실패해도 앱 흐름을 막지 않음)
export async function track(uid: string, name: string, props: Record<string, any> = {}) {
  try {
    const d = await db();
    await d.execute({
      sql: 'INSERT INTO events (uid,name,props) VALUES (?,?,?)',
      args: [uid || 'anon', name, JSON.stringify(props)],
    });
  } catch { /* 로깅 실패는 무시 */ }
}
