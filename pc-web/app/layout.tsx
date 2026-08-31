import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:5173'),
  title: '日常记账 · 本地收支与存款计划',
  description: '每一笔，都离目标更近。本地记账、分类统计与存款计划。',
  openGraph: {
    title: '日常记账',
    description: '每一笔，都离目标更近。',
  },
  twitter: {
    card: 'summary',
    title: '日常记账',
    description: '每一笔，都离目标更近。',
  },
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body data-app="xiaoman">{children}</body>
    </html>
  );
}
