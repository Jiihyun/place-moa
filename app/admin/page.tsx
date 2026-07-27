import { db } from '@/lib/db';

export const dynamic = 'force-dynamic'; // 항상 최신 데이터

const PERSONA: Record<string, string> = {
  fairy: '🧚 릴스 맛집 저장요정', lost: '🗺️ 흩어진 맛집 미아', borderline: '🤔 경계의 미식가',
  organizer: '👑 이미 정리왕', spontaneous: '🎲 즉흥 발걸음파',
};

export default async function Admin() {
  const d = await db();

  const signups = (await d.execute(
    `SELECT nickname, platform, persona, created_at FROM waitlist ORDER BY id DESC`
  )).rows;

  const ev = (await d.execute(
    `SELECT name, COUNT(*) n FROM events GROUP BY name`
  )).rows;
  const cnt: Record<string, number> = {};
  for (const r of ev) cnt[String(r.name)] = Number(r.n);

  // 기타 주관식 + 유형 분포 (quiz_complete props에서)
  const qc = (await d.execute(`SELECT props FROM events WHERE name='quiz_complete' ORDER BY id DESC LIMIT 500`)).rows;
  const others: string[] = [];
  const personaCount: Record<string, number> = {};
  for (const r of qc) {
    try {
      const p = JSON.parse(String(r.props));
      if (p.persona) personaCount[p.persona] = (personaCount[p.persona] || 0) + 1;
      if (p.others) for (const k of Object.keys(p.others)) { const v = p.others[k]; if (v && String(v).trim()) others.push(String(v).trim()); }
    } catch { /* skip */ }
  }

  const g = (k: string) => cnt[k] || 0;
  const started = g('quiz_start');
  const completed = g('quiz_complete');
  const iosN = signups.filter(s => s.platform === 'ios').length;
  const aosN = signups.filter(s => s.platform === 'android').length;

  // 앱 사용 퍼널 / 전환 (/api/stats 와 동일 계산)
  const saveAttempt = g('save_attempt');
  const saveSuccess = g('save_success') + g('save_pending');
  const saveConv = saveAttempt ? Math.round((saveSuccess / saveAttempt) * 100) + '%' : '–';
  const completionRate = started ? Math.round((completed / started) * 100) + '%' : '–';

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#222', lineHeight: 1.5 };
  const card: React.CSSProperties = { background: '#f7f7f7', borderRadius: 14, padding: '16px 18px', flex: 1, minWidth: 120 };
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#888', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, borderBottom: '1px solid #f2f2f2' };

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>장소모아 · 수요조사 대시보드</h1>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 22px' }}>이 페이지는 링크를 아는 사람만 접근 가능해요. 새로고침하면 최신.</p>

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: '#666' }}>퀴즈 · 신청</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>퀴즈 시작</div><div style={{ fontSize: 26, fontWeight: 800 }}>{started}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>퀴즈 완료</div><div style={{ fontSize: 26, fontWeight: 800 }}>{completed}</div><div style={{ fontSize: 11, color: '#aaa' }}>완료율 {completionRate}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>iOS 신청</div><div style={{ fontSize: 26, fontWeight: 800 }}>{iosN}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>안드 신청</div><div style={{ fontSize: 26, fontWeight: 800 }}>{aosN}</div></div>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: '#666' }}>결과 화면 CTA 클릭</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>🌐 웹 체험</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('cta_web')}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>🍎 iOS 베타</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('cta_ios')}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>🤖 안드 알림</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('cta_android')}</div></div>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: '#666' }}>앱 사용 퍼널 (웹 체험 이후)</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>방문</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('visit')}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>저장 시도</div><div style={{ fontSize: 26, fontWeight: 800 }}>{saveAttempt}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>저장 성공</div><div style={{ fontSize: 26, fontWeight: 800 }}>{saveSuccess}</div><div style={{ fontSize: 11, color: '#aaa' }}>전환 {saveConv}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>공유 생성</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('bundle_created')}</div></div>
        <div style={card}><div style={{ fontSize: 12, color: '#888' }}>저장 실패</div><div style={{ fontSize: 26, fontWeight: 800 }}>{g('save_fail')}</div></div>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>신청 명단 ({signups.length})</h2>
      <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 12, marginBottom: 30 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>크루 닉네임</th><th style={th}>플랫폼</th><th style={th}>퀴즈 유형</th><th style={th}>신청 시각(UTC)</th></tr></thead>
          <tbody>
            {signups.length === 0 && <tr><td style={{ ...td, color: '#aaa' }} colSpan={4}>아직 신청자가 없어요.</td></tr>}
            {signups.map((s, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 700 }}>{String(s.nickname || '(없음)')}</td>
                <td style={td}>{s.platform === 'ios' ? '🍎 iOS' : s.platform === 'android' ? '🤖 안드' : String(s.platform)}</td>
                <td style={td}>{PERSONA[String(s.persona)] || String(s.persona || '-')}</td>
                <td style={{ ...td, color: '#888', fontSize: 13 }}>{String(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>유형 분포 (완료자)</h2>
      <div style={{ marginBottom: 30 }}>
        {Object.keys(personaCount).length === 0 ? <p style={{ color: '#aaa' }}>아직 없음</p> :
          Object.entries(personaCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f2f2f2' }}>
              <span>{PERSONA[k] || k}</span><b>{n}명</b>
            </div>
          ))}
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>기타 주관식 답변 ({others.length})</h2>
      {others.length === 0 ? <p style={{ color: '#aaa' }}>아직 없음</p> : (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {others.map((o, i) => <li key={i} style={{ padding: '4px 0', fontSize: 14 }}>{o}</li>)}
        </ul>
      )}
    </main>
  );
}
