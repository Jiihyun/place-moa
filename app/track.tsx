'use client';
import { useEffect } from 'react';

// 모든 페이지에서 방문 1회 기록 (fire-and-forget)
export default function Track() {
  useEffect(() => {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'visit', props: { path: location.pathname } }),
    }).catch(() => {});
  }, []);
  return null;
}
