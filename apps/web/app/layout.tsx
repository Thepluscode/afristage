import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AfriStage — Watch Live',
  description: 'Watch every stage on the continent, free — no app, no card required.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
