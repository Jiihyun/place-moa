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
      `CREATE INDEX IF NOT EXISTS idx_places_uid ON places(uid)`,
      `CREATE INDEX IF NOT EXISTS idx_pendings_uid ON pendings(uid)`,
    ], 'write');
    // 기존 DB 마이그레이션: address 컬럼 추가 (이미 있으면 무시)
    try { await client.execute("ALTER TABLE places ADD COLUMN address TEXT NOT NULL DEFAULT ''"); } catch {}
    try { await client.execute("ALTER TABLE places ADD COLUMN photo TEXT NOT NULL DEFAULT ''"); } catch {}
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

export async function ensureCats(uid: string) {
  const d = await db();
  const n = await d.execute({ sql: 'SELECT COUNT(*) c FROM categories WHERE uid=?', args: [uid] });
  if (Number(n.rows[0].c) === 0) {
    for (const c of DEFAULT_CATS) {
      await d.execute({ sql: 'INSERT INTO categories (uid,name,color,emoji) VALUES (?,?,?,?)', args: [uid, c.name, c.color, c.emoji] });
    }
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
