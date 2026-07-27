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

// 신규 유저 온보딩용 데모 장소 (강남 3곳) — 빈 지도 대신 채워진 첫인상
export const DEMO_PLACES = [
  { title: '다운타우너 강남', category: '맛집', region: '서울 강남구', address: '서울 강남구 강남대로102길', lat: 37.5016, lng: 127.0244, memo: '수제버거 · 웨이팅 필수' },
  { title: '노티드 강남', category: '카페', region: '서울 강남구', address: '서울 강남구 강남대로', lat: 37.5041, lng: 127.0251, memo: '도넛 · 크림라떼 시그니처' },
  { title: '월향 강남', category: '술집·바', region: '서울 강남구', address: '서울 강남구 테헤란로', lat: 37.5005, lng: 127.0360, memo: '전통주 페어링' },
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
      args: [uid, p.title, cat_id, p.region, p.address, '', p.lat, p.lng, 'demo', null, p.memo],
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
