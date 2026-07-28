'use client';
import { useEffect, useState } from 'react';
import { QUESTIONS, OTHER, type Opt, type Q } from '@/lib/quiz';

const C = '#ff385c';
const TESTFLIGHT = process.env.NEXT_PUBLIC_TESTFLIGHT_URL || '';
// 퀴즈와 웹앱은 같은 배포 — 상대경로로 두면 항상 현재 라이브 도메인으로 이동(도메인 하드코딩 불필요)
const WEB_APP = '/';

function track(name: string, props: Record<string, any> = {}) {
  fetch('/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, props }),
  }).catch(() => {});
}

const MAX = QUESTIONS.reduce((s, q) => s + Math.max(...q.opts.map(o => o.points)), 0);

type Persona = {
  key: string; emoji: string; name: string; tag: string; desc: string;
  verdict: 'target' | 'maybe' | 'no';
};

// 기타(주관식) 답변은 점수 계산에서 제외 — 정성 데이터로만 수집, 점수 왜곡 방지
function classify(picks: Opt[]): { pct: number; persona: Persona } {
  const scored = picks.filter(o => o && !o.other);
  const scoredMax = QUESTIONS.reduce((s, q, i) => (picks[i] && !picks[i].other ? s + Math.max(...q.opts.map(o => o.points)) : s), 0);
  const sum = scored.reduce((s, o) => s + o.points, 0);
  const pct = scoredMax ? Math.round((sum / scoredMax) * 100) : 40; // 전부 기타면 중립
  const naver = scored.filter(o => o.naver).length;
  const nosave = scored.some(o => o.nosave);

  let persona: Persona;
  if (nosave && pct < 30) {
    persona = { key: 'spontaneous', emoji: '🎲', name: '즉흥 발걸음파', tag: '저장? 그런 거 안 해요',
      desc: '애초에 저장을 잘 안 하는 타입. 장소모아가 굳이 필요하진 않을 수 있어요. 그래도 궁금하면 구경 환영!', verdict: 'no' };
  } else if (naver >= 2 && pct < 45) {
    persona = { key: 'organizer', emoji: '👑', name: '이미 정리왕', tag: '내 지도는 이미 완벽해',
      desc: '지도 즐겨찾기로 스스로 잘 정리하는 타입. 이미 문제를 해결했네요! 장소모아의 핵심 타겟은 아니에요.', verdict: 'no' };
  } else if (pct >= 70) {
    persona = { key: 'fairy', emoji: '🧚', name: '릴스 맛집 저장요정', tag: '저장은 신나게, 방문은 글쎄',
      desc: 'DM·캡쳐로 열심히 쟁여두지만 정작 못 가는, 장소모아가 딱 만들어진 바로 그 사람! 무덤이 된 저장들, 지도로 살려봐요.', verdict: 'target' };
  } else if (pct >= 45) {
    persona = { key: 'lost', emoji: '🗺️', name: '흩어진 맛집 미아', tag: '어디다 저장했더라…',
      desc: 'DM·캡쳐·저장폴더에 흩어져 정작 필요할 때 못 찾는 타입. 한 지도에 모으면 삶이 편해질 거예요.', verdict: 'target' };
  } else {
    persona = { key: 'borderline', emoji: '🤔', name: '경계의 미식가', tag: '가끔은 나도 저장러',
      desc: '아직 심각하진 않지만, 저장이 늘면 곧 흩어지기 시작할 거예요. 미리 지도에 모아두면 좋아요.', verdict: 'maybe' };
  }
  return { pct, persona };
}

export default function Quiz() {
  const [step, setStep] = useState(-1); // -1 인트로, 0..n-1 문항, n 결과
  const [picks, setPicks] = useState<Opt[]>([]);
  const [others, setOthers] = useState<Record<number, string>>({});

  const total = QUESTIONS.length;

  function start() { track('quiz_start'); setStep(0); }

  function pick(o: Opt, otherText?: string) {
    const nextPicks = [...picks];
    nextPicks[step] = o;
    setPicks(nextPicks);
    const nextOthers = { ...others };
    if (o.other) nextOthers[step] = otherText || '';
    setOthers(nextOthers);

    if (step + 1 < total) setStep(step + 1);
    else {
      const { pct, persona } = classify(nextPicks);
      const answers = nextPicks.map((p, i) => (p?.other ? `기타: ${nextOthers[i] || ''}` : p?.label));
      track('quiz_complete', { pct, persona: persona.key, verdict: persona.verdict, answers, others: nextOthers });
      setStep(total);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 22px 80px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#222', lineHeight: 1.5 }}>
      {step === -1 && <Intro onStart={start} />}
      {step >= 0 && step < total && (
        <Question key={step} q={QUESTIONS[step]} idx={step} total={total} onPick={pick}
          onBack={step > 0 ? () => setStep(step - 1) : undefined} />
      )}
      {step === total && <Result picks={picks} onRetry={() => { setPicks([]); setOthers({}); setStep(-1); }} />}
    </main>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(d => {
      const n = d?.quiz_funnel?.completed;
      if (typeof n === 'number' && n > 0) setCount(n);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      <div style={{
        background: 'linear-gradient(160deg,#ff5c7c 0%,#ff385c 100%)', borderRadius: 26, padding: '46px 24px 42px',
        color: '#fff', boxShadow: '0 14px 34px rgba(255,56,92,.28)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, opacity: .9, letterSpacing: '.04em' }}>MOA TEST</div>
        <h1 style={{ fontSize: 31, fontWeight: 900, letterSpacing: '-.02em', margin: '16px 0 12px' }}>
          맛집 저장 유형 테스트
        </h1>
        <p style={{ fontSize: 15.5, margin: 0, opacity: .95 }}>
          6문항 · 30초로 알아보는<br />내 진짜 저장 성향과 <b>숨은 유형</b>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '20px 0 8px' }}>
        {['#저장BTI', '#맛집저장러', '#나만그런거아니지'].map(t => (
          <span key={t} style={{ fontSize: 13, fontWeight: 700, color: C, background: '#fff0f3', borderRadius: 999, padding: '6px 12px' }}>{t}</span>
        ))}
      </div>

      <button onClick={onStart} style={{ ...btn(true), marginTop: 16, fontSize: 17 }}>내 유형 확인하기 →</button>
      {count != null && (
        <p style={{ color: '#999', fontSize: 13, marginTop: 12 }}>현재 <b style={{ color: '#666' }}>{count.toLocaleString()}명</b>이 참여했어요</p>
      )}
    </div>
  );
}

function Question({ q, idx, total, onPick, onBack }: { q: Q; idx: number; total: number; onPick: (o: Opt, t?: string) => void; onBack?: () => void }) {
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ height: 6, background: '#eee', borderRadius: 3, marginBottom: 22 }}>
        <div style={{ height: '100%', width: `${((idx + 1) / total) * 100}%`, background: C, borderRadius: 3, transition: 'width .2s' }} />
      </div>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 6px' }}>{idx + 1} / {total}</p>
      <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.01em', margin: '0 0 22px' }}>{q.q}</h2>

      {!otherMode ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {q.opts.map((o, i) => (
            <button key={i} onClick={() => (o.other ? setOtherMode(true) : onPick(o))}
              style={o.other ? { ...optBtn, color: '#888', fontWeight: 500 } : optBtn}>{o.label}</button>
          ))}
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); onPick(OTHER, otherText.trim()); }}>
          <input autoFocus type="text" value={otherText} onChange={e => setOtherText(e.target.value)}
            placeholder="직접 입력해 주세요"
            style={{ width: '100%', padding: '14px 16px', fontSize: 16, border: `1px solid ${C}`, borderRadius: 14, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => { setOtherMode(false); setOtherText(''); }}
              style={{ ...btn(false), flex: 1 }}>취소</button>
            <button type="submit" disabled={!otherText.trim()}
              style={{ ...btn(true), flex: 2, opacity: otherText.trim() ? 1 : .5 }}>다음</button>
          </div>
        </form>
      )}

      {onBack && !otherMode && <button onClick={onBack} style={{ ...btn(false), marginTop: 18, background: 'transparent', color: '#999', border: 'none' }}>← 이전</button>}
    </div>
  );
}

function Result({ picks, onRetry }: { picks: Opt[]; onRetry: () => void }) {
  const { pct, persona } = classify(picks);
  const isTarget = persona.verdict !== 'no';

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ textAlign: 'center', background: isTarget ? '#fff0f3' : '#f4f4f5', border: `1px solid ${isTarget ? C : '#ddd'}`, borderRadius: 20, padding: '30px 22px' }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>{persona.emoji}</div>
        <p style={{ color: isTarget ? C : '#888', fontWeight: 700, fontSize: 14, margin: '12px 0 2px' }}>{persona.tag}</p>
        <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>{persona.name}</h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 16px' }}>장소모아 적합도 {pct}%</p>
        <p style={{ fontSize: 15.5, color: '#333', margin: 0 }}>{persona.desc}</p>
      </div>

      {isTarget ? (
        <>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '30px 0 12px' }}>지금 바로 써볼까요?</h3>
          <button onClick={() => { track('cta_web'); location.href = WEB_APP; }} style={btn(true)}>🌐 웹에서 바로 써보기</button>
          <AppSignup persona={persona.key} />
        </>
      ) : (
        <>
          <p style={{ textAlign: 'center', color: '#888', fontSize: 14, margin: '26px 0 12px' }}>타겟은 아니지만, 구경은 언제든 환영이에요 🙂</p>
          <button onClick={() => { track('cta_web'); location.href = WEB_APP; }} style={btn(false)}>🌐 그래도 웹으로 구경하기</button>
        </>
      )}

      <button onClick={onRetry} style={{ ...btn(false), marginTop: 14, background: 'transparent', color: '#999', border: 'none' }}>다시 테스트하기</button>
    </div>
  );
}

function AppSignup({ persona }: { persona: string }) {
  const [open, setOpen] = useState<'ios' | 'android' | null>(null);
  const [nickname, setNickname] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(platform: 'ios' | 'android') {
    setErr('');
    const r = await fetch('/api/waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, platform, persona }),
    });
    if (r.ok) setDoneMsg(platform === 'ios' ? 'iOS 베타 초대를 준비할게요! 🍎' : '안드 출시되면 가장 먼저 알려드릴게요! 🤖');
    else setErr((await r.json().catch(() => ({}))).error || '잠시 후 다시 시도해 주세요');
  }

  if (doneMsg) return (
    <div style={{ background: '#fff0f3', border: `1px solid ${C}`, borderRadius: 14, padding: 18, textAlign: 'center', marginTop: 14 }}>
      <b>신청 완료! 🎉</b><br /><span style={{ color: '#666', fontSize: 14 }}>{doneMsg}</span>
    </div>
  );

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 13, color: '#999', textAlign: 'center', margin: '4px 0 12px' }}>앱으로 더 편하게</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => {
          track('cta_ios');
          if (TESTFLIGHT) location.href = TESTFLIGHT; else setOpen(open === 'ios' ? null : 'ios');
        }} style={{ ...optBtn, flex: 1, textAlign: 'center' }}>🍎 iOS 베타</button>
        <button onClick={() => { track('cta_android'); setOpen(open === 'android' ? null : 'android'); }} style={{ ...optBtn, flex: 1, textAlign: 'center' }}>🤖 안드로이드 알림</button>
      </div>
      {open && (
        <form onSubmit={e => { e.preventDefault(); submit(open); }} style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>
            {open === 'ios' ? 'iOS 베타 신청 — 크루 닉네임' : '안드로이드 출시 알림 — 크루 닉네임'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" required value={nickname} onChange={e => setNickname(e.target.value)} placeholder="크루 닉네임"
              style={{ flex: 1, padding: '12px 14px', fontSize: 15, border: '1px solid #ddd', borderRadius: 12, outline: 'none' }} />
            <button type="submit" style={{ padding: '12px 16px', fontSize: 15, fontWeight: 700, color: '#fff', background: C, border: 'none', borderRadius: 12, cursor: 'pointer' }}>신청</button>
          </div>
          {err && <p style={{ color: C, fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
        </form>
      )}
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '15px', fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: 'pointer',
    border: primary ? 'none' : '1px solid #ddd',
    background: primary ? C : '#fff', color: primary ? '#fff' : '#222',
  };
}

const optBtn: React.CSSProperties = {
  width: '100%', padding: '15px 16px', fontSize: 15.5, fontWeight: 600, textAlign: 'left',
  background: '#f7f7f7', border: '1px solid #eee', borderRadius: 14, cursor: 'pointer', color: '#222',
};
