import { cookies } from 'next/headers';

export async function getUid(): Promise<string> {
  const store = await cookies();
  const c = store.get('moa_uid');
  if (c?.value) return c.value;
  // 미들웨어가 아직 못 심은 첫 요청 등 — 임시 uid (다음 요청부터 쿠키 적용)
  return 'anon';
}
