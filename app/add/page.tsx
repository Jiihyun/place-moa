'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Cand = { name: string; region: string; lat: number | null };

function AddInner() {
  const sp = useSearchParams();
  const url = sp.get('url') || '';
  const [caption, setCaption] = useState(sp.get('caption') || '');
  const [state, setState] = useState<'loading' | 'saved' | 'pending' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState<any>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [usedAI, setUsedAI] = useState(true);
  const [memo, setMemo] = useState('');
  const [memoSaved, setMemoSaved] = useState(false);
  const ran = useRef(false);

  const saveMemo = async (id: number) => {
    await fetch(`/api/places/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memo }) });
    setMemoSaved(true);
  };

  const run = useCallback(async (cap: string) => {
    setState('loading');
    try {
      const r = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, caption: cap }) });
      const j = await r.json();
      if (!r.ok) { setState('error'); setMsg(j.error || '분석에 실패했어요'); return; }
      setUsedAI(j.usedAI);
      if (j.saved) { setSaved(j.saved); setState('saved'); }
      else { setCands(j.pending.candidates); setState('pending'); }
    } catch (e: any) { setState('error'); setMsg('네트워크 오류: ' + e.message); }
  }, [url]);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    if (!url) { setState('error'); setMsg('저장할 링크가 없어요'); return; }
    run(caption);
  }, [url, caption, run]);

  const openApp = (hash = '') => window.open(location.origin + '/' + hash, '_blank');

  const wrap: React.CSSProperties = { maxWidth: 460, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 20px', background: 'var(--surface)' };

  if (state === 'loading') return (
    <div style={wrap}>
      <div style={{ textAlign: 'center' }}>
        <i className="ti ti-loader-2 spin" style={{ fontSize: 40, color: 'var(--primary)' }} />
        <p style={{ margin: '16px 0 4px', fontSize: 17, fontWeight: 600 }}>AI가 장소를 찾는 중…</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)', wordBreak: 'break-all' }}>{url}</p>
      </div>
    </div>
  );

  if (state === 'saved') return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 44 }}>📍</div>
        <p style={{ margin: '10px 0 2px', fontSize: 19, fontWeight: 700 }}>저장됐어요!</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>영상에서 1곳을 찾았어요{usedAI ? '' : ' (데모 추출)'}</p>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{saved.title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text3)' }}><i className="ti ti-map-pin" /> {saved.address || saved.region}{saved.lat == null ? ' · 좌표 미확인' : ''}</p>
      </div>
      <p style={{ margin: '0 0 5px', fontSize: 12, color: 'var(--text2)' }}>메모 (선택)</p>
      <textarea value={memo} onChange={e => { setMemo(e.target.value); setMemoSaved(false); }} onBlur={() => memo && saveMemo(saved.id)}
        placeholder="예: 주말에 가보기, 데이트 코스" style={{ width: '100%', fontSize: 13, minHeight: 54, marginBottom: memoSaved ? 4 : 14 }} />
      {memoSaved && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#1f9d55' }}>✓ 메모 저장됨 — 상세에서 볼 수 있어요</p>}
      <button className="pbtn" onClick={() => { if (memo && !memoSaved) saveMemo(saved.id); openApp(); }}>장소모아 지도에서 보기</button>
      <button style={{ marginTop: 8, border: 'none', background: 'none', color: 'var(--text2)', fontSize: 14 }} onClick={() => window.close()}>닫고 인스타로 돌아가기</button>
    </div>
  );

  if (state === 'pending') return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 40 }}>✨</div>
        <p style={{ margin: '10px 0 2px', fontSize: 19, fontWeight: 700 }}>장소 {cands.length}곳을 찾았어요</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>대기함에서 고를 곳을 확정하세요{usedAI ? '' : ' (데모 추출)'}</p>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        {cands.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < cands.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <i className="ti ti-circle-check-filled" style={{ color: 'var(--primary)', fontSize: 20 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{c.name}</p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: 'var(--text3)' }}><i className="ti ti-map-pin" style={{ fontSize: 11 }} /> {c.region}{c.lat == null ? ' · 좌표 미확인' : ''}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="pbtn" onClick={() => openApp('?to=inbox')}>대기함에서 확정하기</button>
      <button style={{ marginTop: 8, border: 'none', background: 'none', color: 'var(--text2)', fontSize: 14 }} onClick={() => window.close()}>닫고 인스타로 돌아가기</button>
    </div>
  );

  // error
  return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 40 }}>🤔</div>
        <p style={{ margin: '10px 0 2px', fontSize: 18, fontWeight: 700 }}>장소를 못 찾았어요</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>{msg}</p>
      </div>
      <p style={{ margin: '0 0 5px', fontSize: 12, color: 'var(--text2)' }}>캡션·설명을 붙여넣고 다시 시도해 보세요</p>
      <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="게시물 캡션을 붙여넣기…" style={{ width: '100%', fontSize: 13, minHeight: 90, marginBottom: 12 }} />
      <button className="pbtn" onClick={() => run(caption)}>다시 분석</button>
      <button style={{ marginTop: 8, border: 'none', background: 'none', color: 'var(--text2)', fontSize: 14 }} onClick={() => window.close()}>닫기</button>
    </div>
  );
}

export default function AddPage() {
  return <Suspense fallback={null}><AddInner /></Suspense>;
}
