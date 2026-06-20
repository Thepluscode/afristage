import './globals.css';
import { AdminChrome } from './chrome';

export const metadata = { title: 'AfriStage Admin', description: 'Moderation, payouts and platform operations' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminChrome>{children}</AdminChrome>
      </body>
    </html>
  );
}
