'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClaimButton({ id, n }: { id: string; n: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div style={{ marginTop: 24 }}>
      <button
        className="pbtn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch(`/api/bundles/${id}/claim`, { method: 'POST' });
          const j = await r.json();
          alert(j.claimed > 0 ? `${j.claimed}곳을 내 장소모아에 담았어요!` : '이미 내 장소예요 — 담을 새 장소가 없어요.');
          router.push('/');
        }}
      >
        {busy ? '담는 중…' : '받은 장소 저장하기'}
      </button>
      <p style={{ margin: '11px 0 0', textAlign: 'center', fontSize: 12, color: '#8f8b86' }}>
        이 버튼으로 {n}곳을 내 장소모아 지도에 담아요
      </p>
    </div>
  );
}
