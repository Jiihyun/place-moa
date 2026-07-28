// 퀴즈 문항 정의 — 퀴즈 화면(app/quiz)과 집계(admin, /api/stats)가 공유하는 단일 소스.
// 각 보기: points = 장소모아 적합도 점수, naver/nosave = 유형 판별 플래그, other = 주관식.
export type Opt = { label: string; points: number; naver?: boolean; nosave?: boolean; other?: boolean };
export type Q = { q: string; opts: Opt[] };

export const OTHER: Opt = { label: '기타 (직접 입력)', points: 0, other: true };

export const QUESTIONS: Q[] = [
  {
    q: '인스타 릴스·쇼츠에서 가고 싶은 카페·맛집을 보면 어떻게 하시나요?',
    opts: [
      { label: '캡쳐하거나 나에게/친구에게 DM으로 보낸다', points: 25 },
      { label: "인스타 '저장'(북마크) 폴더에 담는다", points: 20 },
      { label: '네이버·카카오 지도 즐겨찾기에 딱 저장한다', points: 3, naver: true },
      { label: '그냥 넘긴다. 나중에 기억나면 검색', points: 0, nosave: true },
      OTHER,
    ],
  },
  {
    q: "네이버·카카오 지도 '즐겨찾기'로 장소 저장, 얼마나 쓰시나요?",
    opts: [
      { label: '귀찮아서 거의 안 쓴다', points: 25 },
      { label: '가끔 쓴다', points: 12 },
      { label: '꼬박꼬박 잘 쓴다', points: 3, naver: true },
      OTHER,
    ],
  },
  {
    q: '저장해둔 맛집 중, 실제로 가본 곳은 얼마나 되시나요?',
    opts: [
      { label: '거의 안 갔다', points: 20 },
      { label: '절반쯤', points: 12 },
      { label: '대부분 간다', points: 3 },
      OTHER,
    ],
  },
  {
    q: '"저번에 저장한 그 집… 어디였지?" 하고 못 찾은 적 있으신가요?',
    opts: [
      { label: '자주 있다', points: 25 },
      { label: '가끔', points: 15 },
      { label: '없다. 잘 찾는다', points: 3 },
      OTHER,
    ],
  },
  {
    q: '친구에게 가고 싶은 곳들을 공유할 때 어떻게 하시나요?',
    opts: [
      { label: '링크·캡쳐를 여러 개 따로따로 보낸다', points: 15 },
      { label: '카톡으로 이름만 나열한다', points: 10 },
      { label: '공유는 잘 안 한다', points: 5 },
      { label: '지도 리스트로 공유한다', points: 3, naver: true },
      OTHER,
    ],
  },
  {
    q: '저장해놓고 "내가 이런 걸 저장했었나?" 하고 까먹은 적 있으신가요?',
    opts: [
      { label: '자주', points: 15 },
      { label: '가끔', points: 8 },
      { label: '없다', points: 2 },
      OTHER,
    ],
  },
];

export type QuestionTally = {
  q: string;
  opts: { label: string; count: number }[];
  other: number; // 기타(주관식) 선택 수
  total: number; // 이 문항에 응답한 수
};

// quiz_complete 이벤트들의 props(JSON 문자열)에서 문항별 보기 선택 수를 집계.
// answers 배열은 문항 순서와 정렬돼 있고, 각 원소는 보기 라벨 또는 "기타: <입력>".
export function tallyQuizAnswers(propsList: string[]): QuestionTally[] {
  const per: QuestionTally[] = QUESTIONS.map(q => ({
    q: q.q,
    opts: q.opts.filter(o => !o.other).map(o => ({ label: o.label, count: 0 })),
    other: 0,
    total: 0,
  }));
  for (const raw of propsList) {
    let answers: unknown;
    try { answers = JSON.parse(raw).answers; } catch { continue; }
    if (!Array.isArray(answers)) continue;
    answers.forEach((a, i) => {
      const bucket = per[i];
      if (!bucket || a == null) return;
      const s = String(a);
      bucket.total++;
      if (s.startsWith('기타:')) { bucket.other++; return; }
      const opt = bucket.opts.find(o => o.label === s);
      if (opt) opt.count++;
      else bucket.other++; // 매칭 안 되는 옛 라벨 등도 기타로 흡수 (데이터 유실 방지)
    });
  }
  return per;
}
