import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tallyQuizAnswers } from '@/lib/quiz';

// 검증용 집계 — 제출 데크 숫자 소스. 공개 라우트지만 개인정보 없음(이메일 수만 카운트).
export async function GET() {
  const d = await db();
  const byName = await d.execute(
    `SELECT name, COUNT(*) n, COUNT(DISTINCT uid) users FROM events GROUP BY name`
  );
  const counts: Record<string, { events: number; users: number }> = {};
  for (const r of byName.rows) counts[String(r.name)] = { events: Number(r.n), users: Number(r.users) };

  const g = (k: string) => counts[k]?.events ?? 0;
  const attempts = g('save_attempt');
  const successes = g('save_success') + g('save_pending');

  const waitlist = await d.execute(`SELECT COUNT(*) n FROM waitlist`);
  const byPlatform = await d.execute(`SELECT platform, COUNT(*) n FROM waitlist GROUP BY platform`);
  const signupsByPlatform: Record<string, number> = {};
  for (const r of byPlatform.rows) signupsByPlatform[String(r.platform)] = Number(r.n);
  const totalPlaces = await d.execute(`SELECT COUNT(*) n, COUNT(DISTINCT uid) u FROM places`);

  const quizStart = g('quiz_start');
  const quizDone = g('quiz_complete');

  // 기타(주관식) 자유입력 모으기 — 정성 데이터
  const qc = await d.execute(`SELECT props FROM events WHERE name='quiz_complete' ORDER BY id DESC LIMIT 300`);
  const quizOthers: string[] = [];
  for (const r of qc.rows) {
    try {
      const p = JSON.parse(String(r.props));
      if (p.others) for (const k of Object.keys(p.others)) { const v = p.others[k]; if (v && String(v).trim()) quizOthers.push(String(v).trim()); }
    } catch { /* skip */ }
  }
  // 문항별 보기 선택 수 (최근 300건 기준)
  const quizQuestions = tallyQuizAnswers(qc.rows.map(r => String(r.props)));

  return NextResponse.json({
    quiz_funnel: {
      started: quizStart,
      completed: quizDone,
      completion_rate: quizStart ? +(quizDone / quizStart).toFixed(2) : null,
      cta_web: g('cta_web'),
      cta_ios: g('cta_ios'),
      cta_android: g('cta_android'),
      others: quizOthers,
      questions: quizQuestions,
    },
    app_funnel: {
      visits: g('visit'),
      save_attempt: attempts,
      save_success: successes,
      bundle_created: g('bundle_created'),
      save_conversion: attempts ? +(successes / attempts).toFixed(2) : null,
    },
    saves_failed: g('save_fail'),
    signups: { total: Number(waitlist.rows[0].n), by_platform: signupsByPlatform },
    places_total: Number(totalPlaces.rows[0].n),
    saving_users: Number(totalPlaces.rows[0].u),
    by_event: counts,
  });
}
