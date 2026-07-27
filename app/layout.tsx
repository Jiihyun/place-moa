import type { Metadata, Viewport } from 'next';
import './globals.css';
import Track from './track';

export const metadata: Metadata = {
  title: '장소모아',
  description: '릴스·영상 속 장소를 AI로 추출해 지도에 모아두는 아카이버',
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ff385c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.31.0/tabler-icons.min.css" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      </head>
      <body><Track />{children}</body>
    </html>
  );
}
