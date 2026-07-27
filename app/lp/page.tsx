'use client';
import { useEffect, useState } from 'react';

const C = '#ff385c';

export default function Landing() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/track', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'lp_view', props: {} }),
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (r.ok) setDone(true);
    else setErr((await r.json().catch(() => ({}))).error || '잠시 후 다시 시도해 주세요');
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '56px 22px 80px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#222', lineHeight: 1.5 }}>
      <p style={{ color: C, fontWeight: 700, letterSpacing: '-.01em', margin: 0 }}>장소모아</p>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: '14px 0 10px' }}>
        릴스로 저장한 맛집,<br />DM에 던져놓고 못 가고 있죠?
      </h1>
      <p style={{ fontSize: 17, color: '#555', margin: '0 0 26px' }}>
        나에게 보내기·캡쳐로 쌓아둔 카페·맛집. 정작 어디 있는지 못 찾고, 결국 안 가게 되죠.
        <b style={{ color: '#222' }}> 링크 공유 한 번이면 AI가 장소를 뽑아 지도에 자동으로 꽂아드려요.</b>
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', display: 'grid', gap: 12 }}>
        {[
          ['🔗', '공유 한 번 → 끝', '릴스·영상 링크만 넘기면 AI가 장소를 추출. 손으로 옮겨 적을 필요 없음.'],
          ['🗺️', '흩어진 저장이 지도로', 'DM·캡쳐에 흩어진 곳들이 한 지도에. 근처 가면 알림.'],
          ['👀', '또 갈 곳만 남긴다', '방문 기록·"또간집" 평가로 진짜 갈 곳만 추려요.'],
        ].map(([e, t, d]) => (
          <li key={t} style={{ display: 'flex', gap: 12, background: '#f7f7f7', borderRadius: 14, padding: '14px 16px' }}>
            <span style={{ fontSize: 22 }}>{e}</span>
            <span><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#666', fontSize: 14 }}>{d}</span></span>
          </li>
        ))}
      </ul>

      {done ? (
        <div style={{ background: '#fff0f3', border: `1px solid ${C}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
          <b>신청 완료! 🎉</b><br /><span style={{ color: '#666', fontSize: 14 }}>베타 열리면 이 메일로 가장 먼저 알려드릴게요.</span>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p style={{ fontWeight: 700, margin: '0 0 10px' }}>출시되면 가장 먼저 써보기</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="이메일 주소"
              style={{ flex: 1, padding: '13px 14px', fontSize: 15, border: '1px solid #ddd', borderRadius: 12, outline: 'none' }}
            />
            <button type="submit" style={{ padding: '13px 18px', fontSize: 15, fontWeight: 700, color: '#fff', background: C, border: 'none', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              사전신청
            </button>
          </div>
          {err && <p style={{ color: C, fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
        </form>
      )}

      <p style={{ marginTop: 22 }}>
        <a href="/" style={{ color: C, fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>지금 바로 써보기 →</a>
      </p>
    </main>
  );
}
